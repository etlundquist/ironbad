import re
import logging

from uuid import UUID
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette import EventSourceResponse, ServerSentEvent

from openai import AsyncOpenAI, AsyncStream
from openai.types.responses import ResponseStreamEvent, ResponseInProgressEvent, ResponseCompletedEvent, ResponseFailedEvent, ResponseTextDeltaEvent

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas import ChatMessageCreate, ChatMessage, ChatMessageEvent, ChatMessageStatusUpdate, ChatMessageTokenDelta, ContractSectionCitation, ChatThread
from app.models import Contract, ContractSection, ContractChatThread, ContractChatMessage
from app.enums import ChatMessageRole, ChatMessageStatus, ContractSectionType, ContractStatus

from app.database import SessionLocal, get_db
from app.prompts import PROMPT_STANDALONE_SEARCH_PHRASE, PROMPT_CONTRACT_CHAT
from app.embeddings import get_text_embedding
from app.utils import count_tokens


router = APIRouter()
logger = logging.getLogger(__name__)


async def get_relevant_sections(db: AsyncSession, contract_id: UUID, search_phrase: str, max_tokens: int = 10000) -> str:
    """fetch the most relevant contract sections given a natural language search phrase and serialize to an XML string"""

    # convert the search phrase to an embedding
    search_phrase_embedding = await get_text_embedding(search_phrase)

    # always include the contract preamble to provide overall context
    preamble_sections = select(ContractSection).where(ContractSection.contract_id == contract_id, ContractSection.type == ContractSectionType.PREAMBLE)
    result = await db.execute(preamble_sections)
    preamble_sections = result.scalars().all()

    # fetch the most relevant additional contract sections based on the standalone search phrase
    statement = (
        select(ContractSection)
        .where(
            ContractSection.contract_id == contract_id,
            ContractSection.type != ContractSectionType.PREAMBLE,
            ContractSection.level == 1,
            ContractSection.embedding.is_not(None)
        )
        .order_by(ContractSection.embedding.cosine_distance(search_phrase_embedding))
        .limit(10)
    )
    result = await db.execute(statement)
    matching_sections = result.scalars().all()

    # serialize the combined sections into a list of XML strings for dynamic context
    serialized_sections = [f"""<section type="{section.type.value}" number="{section.number}">\n{section.markdown}\n</section>""" for section in preamble_sections + matching_sections]

    # truncate the serialized section list based on combined token count to prevent context overflow
    current_token_count, truncated_sections = 0, []
    for section in serialized_sections:
        section_tokens = count_tokens(section)
        if current_token_count + section_tokens > max_tokens:
            break
        else:
            truncated_sections.append(section)
            current_token_count += section_tokens

    # return the serialized sections as a single string for dynamic context
    combined_sections = "\n".join(truncated_sections)
    return combined_sections


async def extract_response_citations(db: AsyncSession, contract_id: UUID, response_content: str) -> list[ContractSectionCitation]:
    """extract citations from a rule evaluation into structured citation objects referencing specific contract sections"""

    # find all square brackets containing at least one valid section number
    bracket_matches = re.findall(r'\[([0-9]+(?:\.[0-9]+)*(?:\s*,\s*[0-9]+(?:\.[0-9]+)*)*)\]', response_content)

    # extract the set of unique section numbers from the square bracket matches
    section_numbers = set([section.strip() for match in bracket_matches for section in match.split(',')])

    # get the matching set of contract sections from the database
    query = select(ContractSection).where(ContractSection.contract_id == contract_id, ContractSection.number.in_(section_numbers))
    result = await db.execute(query)
    contract_sections = result.scalars().all()
    contract_sections_by_number = {section.number: section for section in contract_sections}

    # create a dictionary of citation objects for each response section number that references a valid contract section
    response_citations: list[ContractSectionCitation] = []
    for section_number in section_numbers:
        if contract_section := contract_sections_by_number.get(section_number):
            response_citation = ContractSectionCitation(
                section_id=str(contract_section.id),
                section_number=contract_section.number,
                section_name=contract_section.name,
                beg_page=contract_section.beg_page,
                end_page=contract_section.end_page
            )
            response_citations.append(response_citation)
        else:
            logger.warning(f"cited section number: [{section_number}] not found in the contract's parsed sections")
    return response_citations


async def stream_chat_response(
    contract_id: UUID,
    chat_thread_id: UUID,
    user_message_id: UUID,
    assistant_message_id: UUID,
    response_stream: AsyncStream[ResponseStreamEvent]
) -> AsyncGenerator[ServerSentEvent, None]:
    """generator function to stream the chat response as server-sent events and update the database accordingly"""

    # send the fully-resolved user message as the first event in the response stream
    async with SessionLocal() as db:
        db: AsyncSession
        user_message = await db.get(ContractChatMessage, user_message_id)
        user_message_event = ChatMessageEvent(event="user_message", data=ChatMessage.model_validate(user_message))
    yield ServerSentEvent(event=user_message_event.event, data=user_message_event.data.model_dump_json())

    # iterate over the response stream making database updates and sending events to the client
    async for event in response_stream:
        event: ResponseStreamEvent
        if isinstance(event, ResponseInProgressEvent):
            # send an event indicating the response is in progress
            status_update_event = ChatMessageEvent(
                event="message_status_update",
                data=ChatMessageStatusUpdate(
                    chat_thread_id=chat_thread_id,
                    chat_message_id=assistant_message_id,
                    status=ChatMessageStatus.IN_PROGRESS
                )
            )
            yield ServerSentEvent(event=status_update_event.event, data=status_update_event.data.model_dump_json())
        elif isinstance(event, ResponseTextDeltaEvent):
            # send an event with the next token of the response content
            token_delta_event = ChatMessageEvent(
                event="message_token_delta",
                data=ChatMessageTokenDelta(
                    chat_thread_id=chat_thread_id,
                    chat_message_id=assistant_message_id,
                    delta=event.delta
                )
            )
            yield ServerSentEvent(event=token_delta_event.event, data=token_delta_event.data.model_dump_json())
        elif isinstance(event, ResponseCompletedEvent):
            # send an event indicating the response is complete
            status_update_event = ChatMessageEvent(
                event="message_status_update",
                data=ChatMessageStatusUpdate(
                    chat_thread_id=chat_thread_id,
                    chat_message_id=assistant_message_id,
                    status=ChatMessageStatus.COMPLETED
                )
            )
            yield ServerSentEvent(event=status_update_event.event, data=status_update_event.data.model_dump_json())
            # resolve the citations, update the complete assistant message in the database, and send the full complete assistant message
            async with SessionLocal() as db:
                db: AsyncSession
                assistant_message = await db.get(ContractChatMessage, assistant_message_id)
                response_citations = await extract_response_citations(db, contract_id, event.response.output_text)
                assistant_message.status = ChatMessageStatus.COMPLETED
                assistant_message.content = event.response.output_text
                assistant_message.citations = [citation.model_dump() for citation in response_citations]
                assistant_message_event = ChatMessageEvent(event="assistant_message", data=ChatMessage.model_validate(assistant_message))
                await db.commit()
            yield ServerSentEvent(event=assistant_message_event.event, data=assistant_message_event.data.model_dump_json())
        elif isinstance(event, ResponseFailedEvent):
            # send an event indicating the response failed, update the message in the database, and send the full failed assistant message
            logger.info(f"response failed event: {event.response.error}")
            status_update_event = ChatMessageEvent(
                event="message_status_update",
                data=ChatMessageStatusUpdate(
                    chat_thread_id=chat_thread_id,
                    chat_message_id=assistant_message_id,
                    status=ChatMessageStatus.FAILED
                )
            )
            yield ServerSentEvent(event=status_update_event.event, data=status_update_event.data.model_dump_json())
            # update the failed assistant message in the database and send the full failed assistant message
            async with SessionLocal() as db:
                db: AsyncSession
                assistant_message = await db.get(ContractChatMessage, assistant_message_id)
                assistant_message.status = ChatMessageStatus.FAILED
                assistant_message.content = "There was an error generating the response. Please try again."
                assistant_message_event = ChatMessageEvent(event="assistant_message", data=ChatMessage.model_validate(assistant_message))
                await db.commit()
            yield ServerSentEvent(event=assistant_message_event.event, data=assistant_message_event.data.model_dump_json())


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
    search_phrase = await openai.responses.create(
        model="gpt-4.1-mini",
        instructions=PROMPT_STANDALONE_SEARCH_PHRASE,
        input=conversation_history,
        temperature=0.0,
        timeout=60
    )
    search_phrase = search_phrase.output_text
    # logger.info(f"generated standalone search phrase: {search_phrase}")

    # fetch the most relevant contract sections based on the standalone search phrase and resolve the system prompt
    contract_sections = await get_relevant_sections(db, contract_id, search_phrase)
    system_prompt = PROMPT_CONTRACT_CHAT.format(contract_sections=contract_sections)
    # logger.info(f"resolved system prompt: {system_prompt}")

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
    response_stream = await openai.responses.create(
        model="gpt-4.1-mini",
        instructions=system_prompt,
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


@router.get("/contracts/{contract_id}/chat/threads/{thread_id}", tags=["contract_chat"])
async def get_chat_thread(contract_id: UUID, thread_id: UUID, db: AsyncSession = Depends(get_db)) -> ChatThread:
    """get a single chat thread for a given contract by ID"""

    query = select(ContractChatThread).where(ContractChatThread.contract_id == contract_id, ContractChatThread.id == thread_id)
    result = await db.execute(query)
    chat_thread = result.scalar_one_or_none()
    if not chat_thread:
        raise HTTPException(status_code=404, detail=f"chat_thread_id={thread_id} not found")
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
