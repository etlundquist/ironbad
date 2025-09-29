import io
import logging

from uuid import UUID
from typing import Optional, Tuple
from textwrap import dedent

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
# from sse_starlette import EventSourceResponse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas import ChatMessageCreate, ChatMessage, ChatMessageResponse
from app.models import Contract as DBContract, ChatThread as DBChatThread, ChatMessage as DBChatMessage, ContractSection as DBContractSection

from app.database import get_db
from app.enums import ChatMessageRole, ChatMessageStatus, ContractSectionType, ContractStatus

from app.prompts import PROMPT_STANDALONE_SEARCH_PHRASE, PROMPT_CONTRACT_CHAT
from app.embeddings import get_text_embedding


router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/chat", response_model=ChatMessageResponse, tags=["chat"])
async def send_chat_message(request: ChatMessageCreate, db: AsyncSession = Depends(get_db)) -> ChatMessageResponse:
    """send a new chat message and get the response as a stream of server-sent events"""

    # create a new OpenAI client to handle the request
    openai = AsyncOpenAI()

    # validate the contract passed in the request
    query = select(DBContract).where(DBContract.id == request.contract_id)
    contract_result = await db.execute(query)
    contract = contract_result.scalar_one_or_none()
    if not contract:
        raise HTTPException(status_code=404, detail=f"contract_id={request.contract_id} not found")
    if contract.status == ContractStatus.UPLOADED:
        raise HTTPException(status_code=400, detail="contracts must be ingested prior to chat")

    # validate the chat thread passed in the request or create a new one for a new conversation
    if request.chat_thread_id:
        query = select(DBChatThread).where(DBChatThread.id == request.chat_thread_id)
        chat_thread_result = await db.execute(query)
        chat_thread = chat_thread_result.scalar_one_or_none()
        if not chat_thread:
            raise HTTPException(status_code=404, detail=f"chat_thread_id={request.chat_thread_id} not found")
    else:
        chat_thread = DBChatThread(contract_id=request.contract_id, archived=False)
        db.add(chat_thread)
        await db.flush()

    # create a chat message record in the database for the new user message
    user_message = DBChatMessage(
        chat_thread_id=chat_thread.id,
        status=ChatMessageStatus.COMPLETED,
        role=ChatMessageRole.USER,
        content=request.content
    )
    db.add(user_message)
    await db.flush()

    # fetch the full conversation history for this chat thread and convert the conversation history to OpenAI message format
    query = select(DBChatMessage).where(DBChatMessage.chat_thread_id == chat_thread.id).order_by(DBChatMessage.created_at)
    chat_history_result = await db.execute(query)
    chat_thread_history = [ChatMessage.model_validate(message) for message in chat_history_result.scalars().all()]
    conversation_history = [{"role": message.role.value, "content": message.content} for message in chat_thread_history]
    logger.info(f"conversation history: {conversation_history}")

    # generate a standalone search phrase from the user's message and conversation history
    search_phrase = await openai.responses.create(
        model="gpt-4.1-mini",
        instructions=PROMPT_STANDALONE_SEARCH_PHRASE,
        input=conversation_history,
        temperature=0.0,
        timeout=60
    )
    search_phrase = search_phrase.output_text
    search_phrase_embedding = await get_text_embedding(search_phrase)
    logger.info(f"generated standalone search phrase: {search_phrase}")

    # fetch the most relevant contract sections based on the standalone search phrase
    statement = (
        select(DBContractSection)
        .where(
            DBContractSection.contract_id == request.contract_id,
            DBContractSection.level == 1,
            DBContractSection.embedding.is_not(None)
        )
        .order_by(DBContractSection.embedding.cosine_distance(search_phrase_embedding))
        .limit(10)
    )
    result = await db.execute(statement)
    matching_sections = result.scalars().all()

    preamble_sections = select(DBContractSection).where(DBContractSection.contract_id == request.contract_id, DBContractSection.type == ContractSectionType.PREAMBLE)
    result = await db.execute(preamble_sections)
    preamble_sections = result.scalars().all()

    # serialize the preamble + semantic match sections into a single text string for dynamic context
    serialized_sections = [f"""<section type="{section.type.value}" number="{section.number}">\n{section.markdown}\n</section>""" for section in preamble_sections + matching_sections]
    serialized_sections = "\n".join(serialized_sections)

    # build the system prompt injecting the retrieved sections as dynamic context
    system_prompt = PROMPT_CONTRACT_CHAT.format(contract_sections=serialized_sections)
    logger.info(f"system prompt: {system_prompt}")

    # generate a response using the resolved system prompt and conversation history
    response = await openai.responses.create(
        model="gpt-4.1-mini",
        instructions=system_prompt,
        input=conversation_history,
        temperature=0.0,
        timeout=60
    )
    response_content = response.output_text

    # add the assistant response message to the database and commit the changes
    assistant_message = DBChatMessage(
        chat_thread_id=chat_thread.id,
        parent_chat_message_id=user_message.id,
        status=ChatMessageStatus.COMPLETED,
        role=ChatMessageRole.ASSISTANT,
        content=response_content
    )
    db.add(assistant_message)
    await db.flush()

    # return the fully resolved [user, assistant] message
    response = ChatMessageResponse(
        user_message=ChatMessage.model_validate(user_message),
        assistant_message=ChatMessage.model_validate(assistant_message)
    )

    await db.commit()
    return response
