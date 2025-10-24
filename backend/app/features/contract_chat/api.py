import logging

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import not_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette import EventSourceResponse
from openai import AsyncOpenAI

from app.models import Contract, ContractChatThread, ContractChatMessage
from app.enums import ChatMessageRole, ChatMessageStatus, ContractStatus
from app.features.contract_chat.schemas import ChatMessageCreate, ChatMessage, ChatThread

from app.api.deps import get_db
from app.prompts import PROMPT_STANDALONE_SEARCH_PHRASE, PROMPT_CONTRACT_CHAT

from app.features.contract_chat.services import get_relevant_sections
from app.features.contract_chat.events import stream_chat_response


router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/contracts/{contract_id}/chat/messages", tags=["contract_chat"])
async def send_chat_message(contract_id: UUID, request: ChatMessageCreate, db: AsyncSession = Depends(get_db)) -> EventSourceResponse:
    """send a new contract-specific chat message and get the response as a stream of server-sent events"""

    # create a new OpenAI client to handle the request
    openai = AsyncOpenAI()

    # validate the contract passed in the request
    query = select(Contract).where(Contract.id == contract_id)
    contract_result = await db.execute(query)
    contract = contract_result.scalar_one_or_none()
    if not contract:
        raise HTTPException(status_code=404, detail=f"contract_id={contract_id} not found")
    if contract.status == ContractStatus.UPLOADED:
        raise HTTPException(status_code=400, detail=f"contract_id={contract_id} must be ingested prior to chat")

    # validate the chat thread passed in the request or create a new one for a new conversation
    if request.chat_thread_id:
        query = select(ContractChatThread).where(ContractChatThread.contract_id == contract_id, ContractChatThread.id == request.chat_thread_id)
        chat_thread_result = await db.execute(query)
        chat_thread = chat_thread_result.scalar_one_or_none()
        if not chat_thread:
            raise HTTPException(status_code=404, detail=f"chat_thread_id={request.chat_thread_id} not found")
    else:
        chat_thread = ContractChatThread(contract_id=contract_id, archived=False)
        db.add(chat_thread)
        await db.flush()

    # create a chat message record in the database for the user message
    user_message = ContractChatMessage(
        contract_id=contract_id,
        chat_thread_id=chat_thread.id,
        status=ChatMessageStatus.COMPLETED,
        role=ChatMessageRole.USER,
        content=request.content
    )
    db.add(user_message)
    await db.flush()

    # fetch the full conversation history for this chat thread and convert the conversation history to OpenAI message format
    query = select(ContractChatMessage).where(ContractChatMessage.chat_thread_id == chat_thread.id).order_by(ContractChatMessage.created_at)
    chat_history_result = await db.execute(query)
    chat_thread_history = [ChatMessage.model_validate(message) for message in chat_history_result.scalars().all()]
    conversation_history = [{"role": message.role.value, "content": message.content} for message in chat_thread_history]
    # logger.info(f"chat thread conversation history: {conversation_history}")

    # generate a standalone search phrase from the user's message and conversation history
    instructions = PROMPT_STANDALONE_SEARCH_PHRASE.format(contract_summary=contract.meta["summary"])
    search_phrase = await openai.responses.create(
        model="gpt-4.1-mini",
        instructions=instructions,
        input=conversation_history,
        temperature=0.0,
        timeout=60
    )
    search_phrase = search_phrase.output_text

    # fetch the most relevant contract sections based on the standalone search phrase and resolve the system prompt
    contract_sections = await get_relevant_sections(db, contract_id, search_phrase)

    # create a chat message record in the database for the assistant message
    assistant_message = ContractChatMessage(
        contract_id=contract_id,
        chat_thread_id=chat_thread.id,
        parent_chat_message_id=user_message.id,
        status=ChatMessageStatus.PENDING,
        role=ChatMessageRole.ASSISTANT,
        content="",
    )
    db.add(assistant_message)
    await db.flush()

    # process the streaming response to yield server-sent events back to the client and update the assistant message in the database
    instructions = PROMPT_CONTRACT_CHAT.format(contract_summary=contract.meta["summary"], contract_sections=contract_sections)
    response_stream = await openai.responses.create(
        model="gpt-4.1-mini",
        instructions=instructions,
        input=conversation_history,
        temperature=0.0,
        timeout=60,
        stream=True
    )
    streaming_chat_response = stream_chat_response(
        contract_id=contract_id,
        chat_thread_id=chat_thread.id,
        user_message_id=user_message.id,
        assistant_message_id=assistant_message.id,
        response_stream=response_stream
    )

    # commit the initial messages to the database and return the streaming generator object
    # NOTE: the streaming generator yields events outside the lifecycle of the request handler so we need a separate database session
    await db.commit()
    return EventSourceResponse(streaming_chat_response)


@router.get("/contracts/{contract_id}/chat/threads", tags=["contract_chat"])
async def get_chat_threads(contract_id: UUID, db: AsyncSession = Depends(get_db)) -> list[ChatThread]:
    """get all chat threads for a given contract"""

    query = select(ContractChatThread).where(ContractChatThread.contract_id == contract_id).order_by(ContractChatThread.created_at.desc())
    result = await db.execute(query)
    chat_threads = result.scalars().all()
    return [ChatThread.model_validate(thread) for thread in chat_threads]


@router.get("/contracts/{contract_id}/chat/threads/current", tags=["contract_chat"])
async def get_current_thread(contract_id: UUID, db: AsyncSession = Depends(get_db)) -> ChatThread:
    """get the most recent active chat thread for a given contract"""

    query = (
        select(ContractChatThread)
        .where(ContractChatThread.contract_id == contract_id, not_(ContractChatThread.archived))
        .order_by(ContractChatThread.created_at.desc())
        .limit(1)
    )

    result = await db.execute(query)
    current_thread = result.scalar_one_or_none()
    if not current_thread:
        raise HTTPException(status_code=404, detail=f"no active chat thread found for contract_id={contract_id}")
    else:
        return ChatThread.model_validate(current_thread)


@router.get("/contracts/{contract_id}/chat/threads/{thread_id}", tags=["contract_chat"])
async def get_chat_thread(contract_id: UUID, thread_id: UUID, db: AsyncSession = Depends(get_db)) -> ChatThread:
    """get a single chat thread for a given contract by ID"""

    query = select(ContractChatThread).where(ContractChatThread.contract_id == contract_id, ContractChatThread.id == thread_id)
    result = await db.execute(query)
    chat_thread = result.scalar_one_or_none()
    if not chat_thread:
        raise HTTPException(status_code=404, detail=f"chat_thread_id={thread_id} not found")
    return ChatThread.model_validate(chat_thread)


@router.put("/contracts/{contract_id}/chat/threads/{thread_id}", tags=["contract_chat"])
async def archive_chat_thread(contract_id: UUID, thread_id: UUID, db: AsyncSession = Depends(get_db)) -> ChatThread:
    """archive a chat thread for a given contract by ID"""

    query = select(ContractChatThread).where(ContractChatThread.contract_id == contract_id, ContractChatThread.id == thread_id)
    result = await db.execute(query)
    chat_thread = result.scalar_one_or_none()
    if not chat_thread:
        raise HTTPException(status_code=404, detail=f"chat_thread_id={thread_id} not found")

    chat_thread.archived = True
    await db.commit()
    await db.refresh(chat_thread)
    return ChatThread.model_validate(chat_thread)


@router.get("/contracts/{contract_id}/chat/threads/{thread_id}/messages", tags=["contract_chat"])
async def get_chat_thread_messages(contract_id: UUID, thread_id: UUID, db: AsyncSession = Depends(get_db)) -> list[ChatMessage]:
    """get all messages for a contract-specific chat thread"""

    # validate that the contract-specific chat thread exists
    query = select(ContractChatThread).where(ContractChatThread.contract_id == contract_id, ContractChatThread.id == thread_id)
    thread_result = await db.execute(query)
    chat_thread = thread_result.scalar_one_or_none()
    if not chat_thread:
        raise HTTPException(status_code=404, detail=f"chat_thread_id={thread_id} not found")

    # get all messages for the contract-specific chat thread
    query = select(ContractChatMessage).where(ContractChatMessage.chat_thread_id == thread_id).order_by(ContractChatMessage.created_at)
    result = await db.execute(query)
    messages = result.scalars().all()
    return [ChatMessage.model_validate(message) for message in messages]


@router.get("/contracts/{contract_id}/chat/threads/{thread_id}/messages/{message_id}", tags=["contract_chat"])
async def get_chat_message(contract_id: UUID, thread_id: UUID, message_id: UUID, db: AsyncSession = Depends(get_db)) -> ChatMessage:
    """get a given chat message by ID"""

    # validate that the chat message exists for the contract-specific chat thread
    query = select(ContractChatMessage).where(
        ContractChatMessage.contract_id == contract_id,
        ContractChatMessage.chat_thread_id == thread_id,
        ContractChatMessage.id == message_id
    )
    message_result = await db.execute(query)
    message = message_result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail=f"chat_message_id={message_id} not found")
    return ChatMessage.model_validate(message)
