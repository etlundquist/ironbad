import re
import json
import logging

from asyncio import CancelledError
from datetime import datetime
from typing import AsyncGenerator, AsyncIterator, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette import EventSourceResponse, ServerSentEvent

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openai import AsyncOpenAI
from openai.types.responses import ResponseInProgressEvent, ResponseFailedEvent, ResponseTextDeltaEvent

from agents import Agent, RawResponsesStreamEvent, RunContextWrapper, RunItemStreamEvent, Runner, StreamEvent, function_tool
from agents.model_settings import Reasoning, ModelSettings
from agents.items import  MessageOutputItem, ToolCallItem, ToolCallOutputItem, ReasoningItem

from app.schemas import ConfiguredBaseModel, Contract, ContractSectionNode, NewCommentAnnotationRequest, NewRevisionAnnotationRequest
from app.enums import ChatMessageRole, ChatMessageStatus, ContractSectionType
from app.models import (
    Contract as DBContract, 
    ContractSection as DBContractSection,
    AgentChatMessage as DBAgentChatMessage, 
    AgentChatThread as DBAgentChatThread
)

from app.database import get_db
from app.prompts import PROMPT_REDLINE_AGENT
from app.embeddings import get_text_embedding
from app.utils import string_truncate
from app.routers.contract_actions import handle_make_comment, handle_make_revision

router = APIRouter()
logger = logging.getLogger(__name__)

# agent tool definitions
# ----------------------

class AgentContractSectionPreview(ConfiguredBaseModel):
    type: ContractSectionType
    level: int
    section_number: str
    section_text_preview: str

class AgentContractSection(ConfiguredBaseModel):
    type: ContractSectionType
    level: int
    section_number: str
    section_text: str

class AgentContractTextMatch(ConfiguredBaseModel):
    section_number: str
    match_line: str


class AgentCommentAnnotation(ConfiguredBaseModel):
    status: Literal["applied", "rejected", "conflict"]
    section_number: str
    anchor_text: str
    comment_text: str

class AgentRevisionAnnotation(ConfiguredBaseModel):
    status: Literal["applied", "rejected", "conflict"]
    section_number: str
    old_text: str
    new_text: str

class AgentContext(ConfiguredBaseModel):
    db: AsyncSession
    contract: Contract


def flatten_section_tree(node: ContractSectionNode, max_depth: Optional[int] = None) -> list[ContractSectionNode]:
    """convert the section tree into a flat list of ordered section nodes"""

    flat_sections: list[ContractSectionNode] = []
    if node.type != ContractSectionType.ROOT:
        flat_sections.append(node)

    def dfs(node: ContractSectionNode, current_depth: int) -> None:
        """recursively add children in reading order"""
        
        for section in node.children:
            flat_sections.append(section)
            if max_depth is None or current_depth < max_depth - 1:
                dfs(section, current_depth + 1)

    dfs(node=node, current_depth=0)
    return flat_sections


async def get_relevant_sections(db: AsyncSession, contract_id: UUID, search_phrase: str) -> list[DBContractSection]:
    """fetch the most relevant contract sections given a natural language search phrase"""

    # convert the search phrase to an embedding vector
    search_phrase_embedding = await get_text_embedding(search_phrase)

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
    relevant_sections = result.scalars().all()
    return relevant_sections


async def persist_contract_changes(db: AsyncSession, contract: Contract) -> None:
    """persist contract updates made by the agent to the database"""

    dbcontract = await db.get(DBContract, contract.id)
    dbcontract.section_tree = json.loads(contract.section_tree.model_dump_json())
    dbcontract.annotations = json.loads(contract.annotations.model_dump_json())
    dbcontract.version = contract.version
    await db.commit()


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def list_contract_sections(
    wrapper: RunContextWrapper[AgentContext],
    parent_section_number: Optional[str] = None,
    max_depth: Optional[int] = None
) -> str:
    """
    Get a flat list of ordered contract section previews below an optional parent section (defaults to the root section to list the entire section tree)
    
    :param parent_section_number: an optional parent section number to use to filter the section tree (defaults to the root section)
    :param max_depth: the optional max depth of the section tree to list below the parent section (defaults to no maximum depth)
    :return: a list of section preview objects containing the section type, level, number, and text preview
    """

    if parent_section_number:
        node = wrapper.context.contract.section_tree.get_node_by_id(node_id=parent_section_number)
    else:
        node = wrapper.context.contract.section_tree

    flat_sections = flatten_section_tree(node=node, max_depth=max_depth)
    agent_section_previews = [
        AgentContractSectionPreview(
            type=section.type, 
            level=section.level, 
            section_number=section.number, 
            section_text_preview=string_truncate(string=section.markdown, max_tokens=50)
        ) for section in flat_sections
    ]
    agent_section_previews_json = json.dumps([json.loads(section.model_dump_json()) for section in agent_section_previews], indent=2)
    return agent_section_previews_json


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def get_contract_section(
    wrapper: RunContextWrapper[AgentContext], 
    section_number: str,
    include_children: bool = False,
    max_depth: Optional[int] = None
) -> str:
    """
    Get the full text of a contract section and optionally include child sections up to a specified max depth
    
    :param section_number: the contract section number
    :param include_children: whether to include child sections (defaults to False)
    :param max_depth: the max depth of child sections to include (defaults to no maximum depth)
    :return: a list of section text objects containing the section type, level, number, and full section text
    """

    node = wrapper.context.contract.section_tree.get_node_by_id(node_id=section_number)
    if include_children:
        flat_sections = flatten_section_tree(node=node, max_depth=max_depth)
    else:
        flat_sections = [node]

    agent_sections = [
        AgentContractSection(
            type=section.type,
            level=section.level,
            section_number=section.number,
            section_text=section.markdown
        ) for section in flat_sections
    ]
    agent_sections_json = json.dumps([json.loads(section.model_dump_json()) for section in agent_sections], indent=2)
    return agent_sections_json


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def search_contract_sections(wrapper: RunContextWrapper[AgentContext], search_phrase: str) -> str:
    """
    Search for relevant contract sections using a natural language search phrase
    
    :param search_phrase: the natural language search phrase to use to find relevant contract sections via embedding similarity search
    :return: a list of matching section objects containing the section type, level, number, and full section text
    :raises ValueError: if the provided search phrase is empty or invalid
    """

    relevant_sections = await get_relevant_sections(wrapper.context.db, wrapper.context.contract.id, search_phrase)
    agent_sections = [
        AgentContractSection(
            type=section.type,
            level=section.level,
            section_number=section.number,
            section_text=section.markdown
        ) for section in relevant_sections
    ]
    agent_sections_json = json.dumps([json.loads(section.model_dump_json()) for section in agent_sections], indent=2)
    return agent_sections_json


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def search_contract_lines(wrapper: RunContextWrapper[AgentContext], pattern: str) -> str:
    """
    Search for matching contract text lines using a regular expression pattern

    :param pattern: the regular expression pattern to match against contract text lines
    :return: a list of match objects containing the relevant section number and matching line text
    :raises ValueError: if the provided pattern is not a valid regular expression
    """
    
    flat_sections = flatten_section_tree(wrapper.context.contract.section_tree)
    compiled_pattern = re.compile(pattern, re.IGNORECASE)
    matches: list[AgentContractTextMatch] = []
    
    for section in flat_sections:
        section_lines = section.markdown.split('\n')
        for line in section_lines:
            if compiled_pattern.search(line):
                match = AgentContractTextMatch(section_number=section.number, match_line=line.strip())
                matches.append(match)
    
    matches_json = json.dumps([json.loads(match.model_dump_json()) for match in matches], indent=2)
    return matches_json


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def make_comment(wrapper: RunContextWrapper[AgentContext], section_number: str, anchor_text: str, comment_text: str) -> str:
    """
    Make a new comment anchored to a specific contract section and text span.

    Comments must be anchored to a single contract section and within-section consecutive text span. 
    The anchor text must exactly match the text as it appears in the retrieved contract section.
    Comments are displayed in the UI as highlights over the anchor text with the comment text displayed in a tooltip.
    Comments are stored in an annotations collection associated with the contract itself.

    :param section_number: the section number of the contract to which the comment applies
    :param anchor_text: the anchor text for the comment exactly as it appears in the retrieved contract section text
    :param comment_text: the new comment text
    :return: the newly created comment annotation object
    """

    # get/validate the relevant section node
    try:
        section_node = wrapper.context.contract.section_tree.get_node_by_id(node_id=section_number)
    except ValueError:
        raise ValueError(f"{section_number=} not found in the contract sections")

    # get/validate the offsets for the anchor text
    try:
        offset_beg = section_node.markdown.index(anchor_text)
        offset_end = offset_beg + len(anchor_text)
    except ValueError:
        raise ValueError(f"{anchor_text=} not found in the contract section text")

    # create the new comment annotation object
    request = NewCommentAnnotationRequest(
        node_id=section_number,
        offset_beg=offset_beg,
        offset_end=offset_end,
        anchor_text=anchor_text,
        comment_text=comment_text
    )
    try:
        handle_make_comment(contract=wrapper.context.contract, request=request)
        await persist_contract_changes(db=wrapper.context.db, contract=wrapper.context.contract)
        return AgentCommentAnnotation(status="applied", section_number=section_number, anchor_text=anchor_text, comment_text=comment_text).model_dump_json(indent=2)
    except Exception as e:
        raise ValueError(f"failed to apply comment: {e}")


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def make_revision(wrapper: RunContextWrapper[AgentContext], section_number: str, old_text: str, new_text: str) -> str:
    """
    Make a new suggested revision anchored to a specific contract section and text span.

    Suggested revisions must be anchored to a single contract section and within-section consecutive text span. 
    The old text must exactly match the text as it appears in the retrieved contract section.
    Suggested revisions are displayed in the UI using strikethrough formatting for the old text and highlighting for the new text.
    Suggested revisions are stored in an annotations collection associated with the contract itself.

    :param section_number: the section number of the contract to which the revision applies
    :param old_text: the old text for the revision exactly as it appears in the retrieved contract section text
    :param new_text: the new text for the revision
    :return: the newly created suggested revision annotation object
    """

    # get/validate the relevant section node
    try:
        section_node = wrapper.context.contract.section_tree.get_node_by_id(node_id=section_number)
    except ValueError:
        raise ValueError(f"{section_number=} not found in the contract sections")

    # get/validate the offsets for the old text
    try:
        offset_beg = section_node.markdown.index(old_text)
        offset_end = offset_beg + len(old_text)
    except ValueError:
        raise ValueError(f"{old_text=} not found in the contract section text")

    # create the new revision annotation object
    request = NewRevisionAnnotationRequest(
        node_id=section_number,
        offset_beg=offset_beg,
        offset_end=offset_end,
        old_text=old_text,
        new_text=new_text
    )
    try:
        handle_make_revision(contract=wrapper.context.contract, request=request)
        await persist_contract_changes(db=wrapper.context.db, contract=wrapper.context.contract)
        return AgentRevisionAnnotation(status="applied", section_number=section_number, old_text=old_text, new_text=new_text).model_dump_json(indent=2)
    except Exception as e:
        raise ValueError(f"failed to apply revision: {e}")

# agent configuration and definition
# ----------------------------------

model_settings = ModelSettings(
    reasoning=Reasoning(effort="medium", summary="detailed"), 
    verbosity="medium", 
    store=True
)

agent = Agent[AgentContext](
    name="Contract Redline Agent",
    model="gpt-5-mini",
    instructions=PROMPT_REDLINE_AGENT,
    model_settings=model_settings,
    tools=[list_contract_sections, get_contract_section, search_contract_sections, search_contract_lines, make_comment, make_revision]
)

# agent runs type definitions
# ---------------------------

class AgentRunRequest(ConfiguredBaseModel):
    contract_id: UUID
    chat_thread_id: Optional[UUID] = None
    content: str

class AgentRunEventStreamContext(ConfiguredBaseModel):
    db: AsyncSession
    chat_thread_id: UUID
    user_message_id: UUID
    assistant_message_id: UUID


class AgentChatThread(ConfiguredBaseModel):
    id: UUID
    contract_id: UUID
    openai_conversation_id: str
    created_at: datetime
    updated_at: datetime

class AgentChatMessage(ConfiguredBaseModel):
    id: UUID
    chat_thread_id: UUID
    parent_chat_message_id: Optional[UUID] = None
    status: ChatMessageStatus
    role: ChatMessageRole
    content: str
    created_at: datetime
    updated_at: datetime


class AgentRunCreatedEvent(ConfiguredBaseModel):
    event: Literal["run_created"] = "run_created"
    chat_thread: AgentChatThread
    user_message: AgentChatMessage
    assistant_message: AgentChatMessage

class AgentRunCompletedEvent(ConfiguredBaseModel):
    event: Literal["run_completed"] = "run_completed"
    assistant_message: AgentChatMessage

class AgentRunFailedEvent(ConfiguredBaseModel):
    event: Literal["run_failed"] = "run_failed"
    assistant_message: AgentChatMessage

class AgentRunCancelledEvent(ConfiguredBaseModel):
    event: Literal["run_cancelled"] = "run_cancelled"
    assistant_message: AgentChatMessage

class AgentRunMessageStatusUpdateEvent(ConfiguredBaseModel):
    event: Literal["message_status_update"] = "message_status_update"
    chat_thread_id: UUID
    chat_message_id: UUID
    status: ChatMessageStatus

class AgentRunMessageTokenDeltaEvent(ConfiguredBaseModel):
    event: Literal["message_token_delta"] = "message_token_delta"
    chat_thread_id: UUID
    chat_message_id: UUID
    delta: str

class AgentToolCallEvent(ConfiguredBaseModel):
    event: Literal["tool_call"] = "tool_call"
    chat_thread_id: UUID
    chat_message_id: UUID
    tool_name: str
    tool_call_id: str 
    tool_call_args: dict
    
class AgentToolCallOutputEvent(ConfiguredBaseModel):
    event: Literal["tool_call_output"] = "tool_call_output"
    chat_thread_id: UUID
    chat_message_id: UUID
    tool_call_id: str   
    tool_call_output: str

class AgentReasoningSummaryEvent(ConfiguredBaseModel):
    event: Literal["reasoning_summary"] = "reasoning_summary"
    chat_thread_id: UUID
    chat_message_id: UUID
    reasoning_id: str
    reasoning_summary: str

# agent runs event stream handler definition
# ------------------------------------------

async def handle_event_stream(event_stream: AsyncIterator[StreamEvent], context: AgentRunEventStreamContext) -> AsyncGenerator[ServerSentEvent, None]:
    """convert agent stream events into server-sent events and forward them to the client"""

    # send the initial run created event initializing the chat thread and user/assistant messages
    chat_thread = await context.db.get(DBAgentChatThread, context.chat_thread_id)
    user_message = await context.db.get(DBAgentChatMessage, context.user_message_id)
    assistant_message = await context.db.get(DBAgentChatMessage, context.assistant_message_id)
    run_created_event = AgentRunCreatedEvent(
        chat_thread=AgentChatThread.model_validate(chat_thread),
        user_message=AgentChatMessage.model_validate(user_message),
        assistant_message=AgentChatMessage.model_validate(assistant_message)
    )
    yield ServerSentEvent(event=run_created_event.event, data=run_created_event.model_dump_json())

    try:

        async for event in event_stream:

            # handle relevant (low-level) raw response stream events
            if isinstance(event, RawResponsesStreamEvent):
                if isinstance(event.data, ResponseInProgressEvent):
                    # send an in-progress status update event to the client
                    sse_event = AgentRunMessageStatusUpdateEvent(
                        chat_thread_id=context.chat_thread_id,
                        chat_message_id=context.assistant_message_id,
                        status=ChatMessageStatus.IN_PROGRESS
                    )
                    yield ServerSentEvent(event=sse_event.event, data=sse_event.model_dump_json())
                    # update the assistant message status in the database
                    assistant_message = await context.db.get(DBAgentChatMessage, context.assistant_message_id)
                    assistant_message.status = ChatMessageStatus.IN_PROGRESS
                    await context.db.commit()
                elif isinstance(event.data, ResponseTextDeltaEvent):
                    # send a token delta event to the client to build the response content in real-time
                    sse_event = AgentRunMessageTokenDeltaEvent(
                        chat_thread_id=context.chat_thread_id,
                        chat_message_id=context.assistant_message_id,
                        delta=event.data.delta
                    )
                    yield ServerSentEvent(event=sse_event.event, data=sse_event.model_dump_json())
                elif isinstance(event.data, ResponseFailedEvent):
                    # log the error details for debugging
                    logger.error(f"agent run failed: {event.data.response.error}")
                    # send a failed status update event to the client
                    sse_event = AgentRunMessageStatusUpdateEvent(
                        chat_thread_id=context.chat_thread_id,
                        chat_message_id=context.assistant_message_id,
                        status=ChatMessageStatus.FAILED
                    )
                    yield ServerSentEvent(event=sse_event.event, data=sse_event.model_dump_json())
                    # update the finalized assistant message status/content in the database for the failed run
                    assistant_message = await context.db.get(DBAgentChatMessage, context.assistant_message_id)
                    assistant_message.status = ChatMessageStatus.FAILED
                    assistant_message.content = "There was an error generating the response. Please try again."
                    sse_event = AgentRunFailedEvent(assistant_message=AgentChatMessage.model_validate(assistant_message))
                    await context.db.commit()
                    yield ServerSentEvent(event=sse_event.event, data=sse_event.model_dump_json())
                    break

            # handle the (high-level) agent run item stream events
            elif isinstance(event, RunItemStreamEvent):
                if isinstance(event.item, ToolCallItem):
                    # send a tool call event to the client with the tool name and call id/args
                    sse_event = AgentToolCallEvent(
                        chat_thread_id=context.chat_thread_id,
                        chat_message_id=context.assistant_message_id,
                        tool_name=event.item.raw_item.name, 
                        tool_call_id=event.item.raw_item.call_id, 
                        tool_call_args=json.loads(event.item.raw_item.arguments)
                    )
                    yield ServerSentEvent(event=sse_event.event, data=sse_event.model_dump_json())
                elif isinstance(event.item, ToolCallOutputItem):
                    # send a tool call output event to the client with the tool call id and tool call output
                    sse_event = AgentToolCallOutputEvent(
                        chat_thread_id=context.chat_thread_id,
                        chat_message_id=context.assistant_message_id,
                        tool_call_id=event.item.raw_item["call_id"], 
                        tool_call_output=str(event.item.raw_item["output"])
                    )
                    yield ServerSentEvent(event=sse_event.event, data=sse_event.model_dump_json())
                elif isinstance(event.item, ReasoningItem):
                    # send a reasoning summary event to the client with the reasoning id and summary
                    sse_event = AgentReasoningSummaryEvent(
                        chat_thread_id=context.chat_thread_id,
                        chat_message_id=context.assistant_message_id,
                        reasoning_id=event.item.raw_item.id, 
                        reasoning_summary="\n\n".join([summary.text for summary in event.item.raw_item.summary if summary.type == "summary_text"])
                    )
                    if sse_event.reasoning_summary.strip():
                        yield ServerSentEvent(event=sse_event.event, data=sse_event.model_dump_json())
                    else:
                        logger.warning(f"reasoning item={sse_event.reasoning_id} summary is empty - skipping event emission")
                elif isinstance(event.item, MessageOutputItem):
                    # update the finalized assistant message status/content in the database for the completed run
                    assistant_message = await context.db.get(DBAgentChatMessage, context.assistant_message_id)
                    assistant_message.status = ChatMessageStatus.COMPLETED
                    assistant_message.content = "".join([message.text for message in event.item.raw_item.content if message.type == "output_text"])
                    sse_event = AgentRunCompletedEvent(assistant_message=AgentChatMessage.model_validate(assistant_message))
                    await context.db.commit()
                    yield ServerSentEvent(event=sse_event.event, data=sse_event.model_dump_json())
                    break

    except CancelledError:
        # log the cancellation for debugging and update the cancelled assistant message status/content in the database for the cancelled run
        logger.error("agent run cancelled!", exc_info=True)
        assistant_message = await context.db.get(DBAgentChatMessage, context.assistant_message_id)
        assistant_message.status = ChatMessageStatus.CANCELLED
        assistant_message.content = "The agent run was cancelled. Please try again."
        sse_event = AgentRunCancelledEvent(assistant_message=AgentChatMessage.model_validate(assistant_message))
        await context.db.commit()
        yield ServerSentEvent(event=sse_event.event, data=sse_event.model_dump_json())
    except Exception:
        # log the error details for debugging and update the failed assistant message status/content in the database for the failed run
        logger.error("agent run failed!", exc_info=True)
        assistant_message = await context.db.get(DBAgentChatMessage, context.assistant_message_id)
        assistant_message.status = ChatMessageStatus.FAILED
        assistant_message.content = "There was an error generating the response. Please try again."
        sse_event = AgentRunFailedEvent(assistant_message=AgentChatMessage.model_validate(assistant_message))
        await context.db.commit()
        yield ServerSentEvent(event=sse_event.event, data=sse_event.model_dump_json())


# agent runs endpoint definitions
# -------------------------------

@router.post("/agent/runs", tags=["agent"])
async def run_agent(request: AgentRunRequest, db: AsyncSession = Depends(get_db)) -> EventSourceResponse:
    """create and execute a new agent run"""
    
    # fetch the relevant contract from the database and deserialize to pydantic to add to the agent's runtime context
    query = select(DBContract).where(DBContract.id == request.contract_id)
    result = await db.execute(query)
    dbcontract = result.scalar_one_or_none()
    if not dbcontract:
        raise HTTPException(status_code=404, detail=f"contract_id={request.contract_id} not found")
    contract = Contract.model_validate(dbcontract)

    # get/create the relevant chat thread for the agent run
    # NOTE: conversation state/history is managed server-side via the OpenAI Conversations API
    if request.chat_thread_id:
        query = select(DBAgentChatThread).where(DBAgentChatThread.id == request.chat_thread_id)
        result = await db.execute(query)
        chat_thread = result.scalar_one_or_none()
        if not chat_thread:
            raise HTTPException(status_code=404, detail=f"chat_thread_id={request.chat_thread_id} not found")
    else:
        openai = AsyncOpenAI()
        openai_conversation = await openai.conversations.create()
        chat_thread = DBAgentChatThread(contract_id=contract.id, openai_conversation_id=openai_conversation.id)
        db.add(chat_thread)
        await db.flush()

    # add the new user message to the database
    user_message = DBAgentChatMessage(
        contract_id=contract.id, 
        chat_thread_id=chat_thread.id, 
        status=ChatMessageStatus.COMPLETED,
        role=ChatMessageRole.USER, 
        content=request.content
    )
    db.add(user_message)
    await db.flush()

    # add the new assistant message to the database 
    # NOTE: we mark the new assistant message as pending and set it's content to a default value to be updated via the event stream handler
    assistant_message = DBAgentChatMessage(
        contract_id=contract.id, 
        chat_thread_id=chat_thread.id, 
        status=ChatMessageStatus.PENDING,
        role=ChatMessageRole.ASSISTANT, 
        content="",
        parent_chat_message_id=user_message.id
    )
    db.add(assistant_message)
    await db.flush()

    # create the agent's runtime context and the event stream handler's context 
    agent_context = AgentContext(db=db, contract=contract)
    stream_context = AgentRunEventStreamContext(db=db, chat_thread_id=chat_thread.id, user_message_id=user_message.id, assistant_message_id=assistant_message.id)

    # execute the agent run with the user's current input, conversation history, and dynamic agent runtime context
    result = Runner.run_streamed(
        starting_agent=agent, 
        conversation_id=chat_thread.openai_conversation_id,
        input=request.content, 
        context=agent_context,
        max_turns=20
    )

    # commit the initial user/assistant messages to the database and return the event stream response
    await db.commit()
    return EventSourceResponse(handle_event_stream(event_stream=result.stream_events(), context=stream_context))


@router.get("/agent/threads", tags=["agent"])
async def get_agent_threads(db: AsyncSession = Depends(get_db)) -> list[AgentChatThread]:
    """get all agent chat threads"""

    query = select(DBAgentChatThread).order_by(DBAgentChatThread.created_at.desc())
    result = await db.execute(query)
    chat_threads = result.scalars().all()
    return [AgentChatThread.model_validate(thread) for thread in chat_threads]


@router.get("/agent/threads/current", tags=["agent"])
async def get_current_agent_thread(db: AsyncSession = Depends(get_db)) -> AgentChatThread:
    """get the most recent agent chat thread"""

    query = select(DBAgentChatThread).order_by(DBAgentChatThread.created_at.desc()).limit(1)
    result = await db.execute(query)
    current_thread = result.scalar_one_or_none()
    if not current_thread:
        raise HTTPException(status_code=404, detail="no currentagent chat thread found")
    else:
        return AgentChatThread.model_validate(current_thread)


@router.get("/agent/threads/{thread_id}", tags=["agent"])
async def get_agent_thread(thread_id: UUID, db: AsyncSession = Depends(get_db)) -> AgentChatThread:
    """get a single agent chat thread by ID"""

    query = select(DBAgentChatThread).where(DBAgentChatThread.id == thread_id)
    result = await db.execute(query)
    chat_thread = result.scalar_one_or_none()
    if not chat_thread:
        raise HTTPException(status_code=404, detail=f"agent_chat_thread_id={thread_id} not found")
    return AgentChatThread.model_validate(chat_thread)


@router.get("/agent/threads/{thread_id}/messages", tags=["agent"])
async def get_agent_thread_messages(thread_id: UUID, db: AsyncSession = Depends(get_db)) -> list[AgentChatMessage]:
    """get all messages for an agent chat thread"""

    # validate that the agent chat thread exists
    query = select(DBAgentChatThread).where(DBAgentChatThread.id == thread_id)
    thread_result = await db.execute(query)
    chat_thread = thread_result.scalar_one_or_none()
    if not chat_thread:
        raise HTTPException(status_code=404, detail=f"agent_chat_thread_id={thread_id} not found")

    # get all messages for the agent chat thread
    query = select(DBAgentChatMessage).where(DBAgentChatMessage.chat_thread_id == thread_id).order_by(DBAgentChatMessage.created_at)
    result = await db.execute(query)
    messages = result.scalars().all()
    return [AgentChatMessage.model_validate(message) for message in messages]


@router.get("/agent/threads/{thread_id}/messages/{message_id}", tags=["agent"])
async def get_agent_chat_message(thread_id: UUID, message_id: UUID, db: AsyncSession = Depends(get_db)) -> AgentChatMessage:
    """get a given agent chat message by ID"""

    # validate that the chat message exists for the agent chat thread
    query = select(DBAgentChatMessage).where(DBAgentChatMessage.chat_thread_id == thread_id, DBAgentChatMessage.id == message_id)
    message_result = await db.execute(query)
    message = message_result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail=f"agent_chat_message_id={message_id} not found")
    return AgentChatMessage.model_validate(message)
