import re
import logging

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
# from sse_starlette import EventSourceResponse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas import ChatMessageCreate, ChatMessage, ChatMessageResponse, ContractSectionCitation
from app.models import Contract as DBContract, ChatThread as DBChatThread, ChatMessage as DBChatMessage, ContractSection as DBContractSection

from app.database import get_db
from app.enums import ChatMessageRole, ChatMessageStatus, ContractSectionType, ContractStatus
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
    preamble_sections = select(DBContractSection).where(DBContractSection.contract_id == contract_id, DBContractSection.type == ContractSectionType.PREAMBLE)
    result = await db.execute(preamble_sections)
    preamble_sections = result.scalars().all()

    # fetch the most relevant additional contract sections based on the standalone search phrase
    statement = (
        select(DBContractSection)
        .where(
            DBContractSection.contract_id == contract_id,
            DBContractSection.type != ContractSectionType.PREAMBLE,
            DBContractSection.level == 1,
            DBContractSection.embedding.is_not(None)
        )
        .order_by(DBContractSection.embedding.cosine_distance(search_phrase_embedding))
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
    query = select(DBContractSection).where(DBContractSection.contract_id == contract_id, DBContractSection.number.in_(section_numbers))
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
            logger.warning(f"cited section number {section_number} not found in the contract's parsed sections")
    return response_citations


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
        raise HTTPException(status_code=400, detail="contract_id={request.contract_id} must be ingested prior to chat")

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

    # fetch the most relevant contract sections based on the standalone search phrase
    contract_sections = await get_relevant_sections(db, request.contract_id, search_phrase)

    # build the system prompt injecting the retrieved sections as dynamic context
    system_prompt = PROMPT_CONTRACT_CHAT.format(contract_sections=contract_sections)
    # logger.info(f"resolved system prompt: {system_prompt}")

    # generate a response using the resolved system prompt and conversation history
    response = await openai.responses.create(
        model="gpt-4.1-mini",
        instructions=system_prompt,
        input=conversation_history,
        temperature=0.0,
        timeout=60
    )

    # parse the raw response content to extract the section-specific inline citations
    response_citations = await extract_response_citations(db, request.contract_id, response.output_text)

    # add the assistant response message to the database with the extracted citations
    assistant_message = DBChatMessage(
        chat_thread_id=chat_thread.id,
        parent_chat_message_id=user_message.id,
        status=ChatMessageStatus.COMPLETED,
        role=ChatMessageRole.ASSISTANT,
        content=response.output_text,
        citations=[citation.model_dump() for citation in response_citations]
    )
    db.add(assistant_message)
    await db.flush()

    # return the fully resolved [user, assistant] message for FE display and commit changes for this turn
    response = ChatMessageResponse(
        user_message=ChatMessage.model_validate(user_message),
        assistant_message=ChatMessage.model_validate(assistant_message)
    )
    await db.commit()
    return response
