import re
import json
import logging

from typing import AsyncGenerator, AsyncIterator
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette import EventSourceResponse, ServerSentEvent

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas import ConfiguredBaseModel, Contract, ContractSectionNode, NewCommentAnnotationRequest, NewRevisionAnnotationRequest
from app.models import Contract as DBContract, ContractSection as DBContractSection
from app.enums import ContractSectionType

from app.database import get_db
from app.prompts import PROMPT_REDLINE_AGENT
from app.embeddings import get_text_embedding
from app.utils import string_truncate

from app.routers.contract_actions import handle_make_comment, handle_make_revision

from agents import Agent, RunContextWrapper, RunItemStreamEvent, Runner, StreamEvent, function_tool
from agents.model_settings import Reasoning, ModelSettings
from agents.items import  MessageOutputItem, ToolCallItem, ToolCallOutputItem, ReasoningItem

router = APIRouter()
logger = logging.getLogger(__name__)

# agent run request/response types
# --------------------------------

class AgentRunRequest(ConfiguredBaseModel):
    contract_id: UUID
    message: str

class AgentRunResponse(ConfiguredBaseModel):
    id: UUID
    message: str


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
    section_number: str
    anchor_text: str
    comment_text: str

class AgentRevisionAnnotation(ConfiguredBaseModel):
    section_number: str
    old_text: str
    new_text: str

class AgentContext(ConfiguredBaseModel):
    run_id: UUID
    db: AsyncSession
    contract: Contract

# agent tool helper functions
# ---------------------------

def flatten_section_tree(node: ContractSectionNode) -> list[ContractSectionNode]:
    """convert the section tree into a flat list of ordered section nodes"""

    flat_sections: list[ContractSectionNode] = []
    for section in node.children:
        flat_sections.append(section)
        flat_sections.extend(flatten_section_tree(section))
    return flat_sections


async def get_relevant_sections(db: AsyncSession, contract_id: UUID, search_phrase: str) -> list[DBContractSection]:
    """fetch the most relevant contract sections given a natural language search phrase"""

    # convert the search phrase to an embedding
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

# agent tool definitions
# ----------------------

@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def list_contract_sections(wrapper: RunContextWrapper[AgentContext]) -> list[AgentContractSectionPreview]:
    """
    Get a flat list of contract sections with a text preview for each section
    
    :return: a list of section preview objects containing the section type, level, number, and text preview
    """

    flat_sections = flatten_section_tree(wrapper.context.contract.section_tree)
    agent_section_previews = [
        AgentContractSectionPreview(
            type=section.type, 
            level=section.level, 
            section_number=section.number, 
            section_text_preview=string_truncate(string=section.markdown, max_tokens=50)
        ) for section in flat_sections
    ]
    return agent_section_previews


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def get_contract_section_text(wrapper: RunContextWrapper[AgentContext], section_number: str) -> str:
    """
    Get the full text of a single contract section
    
    :param section_number: the contract section number
    :return: the full text of the contract section as a markdown string
    :raises ValueError: if the provided section number is invalid or the section is not found
    """

    section_node = wrapper.context.contract.section_tree.get_node_by_id(node_id=section_number)
    return section_node.markdown


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def search_contract_sections(wrapper: RunContextWrapper[AgentContext], search_phrase: str) -> list[AgentContractSection]:
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
    return agent_sections


@function_tool(docstring_style="sphinx", use_docstring_info=True)
async def search_contract_lines(wrapper: RunContextWrapper[AgentContext], pattern: str) -> list[AgentContractTextMatch]:
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
    
    return matches


@function_tool(docstring_style="sphinx", use_docstring_info=True)
def make_comment(wrapper: RunContextWrapper[AgentContext], section_number: str, anchor_text: str, comment_text: str) -> AgentCommentAnnotation:
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
    :raises ModelRetry: if the provided section number is invalid or the provided anchor text cannot be found in the contract section text
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
    except Exception as e:
        raise ValueError(f"failed to apply comment: {e}")

    annotation = AgentCommentAnnotation(section_number=section_number, anchor_text=anchor_text, comment_text=comment_text)
    return annotation


@function_tool(docstring_style="sphinx", use_docstring_info=True)
def make_revision(wrapper: RunContextWrapper[AgentContext], section_number: str, old_text: str, new_text: str) -> AgentRevisionAnnotation:
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
    :raises ModelRetry: if the provided section number is invalid or the provided old text cannot be found in the contract section text
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
    except Exception as e:
        raise ValueError(f"failed to apply revision: {e}")

    annotation = AgentRevisionAnnotation(section_number=section_number, old_text=old_text, new_text=new_text)
    return annotation

# core agent configuration and dependencies
# -----------------------------------------

model_settings = ModelSettings(
    reasoning=Reasoning(effort="medium", summary="detailed"),
    verbosity="medium",
)

agent = Agent[AgentContext](
    name="Redline Agent",
    instructions=PROMPT_REDLINE_AGENT,
    model="gpt-5-mini",
    model_settings=model_settings,
    tools=[list_contract_sections, get_contract_section_text, search_contract_sections, search_contract_lines, make_comment, make_revision]
)

# agent runs helper functions
# ---------------------------

async def handle_event_stream(event_stream: AsyncIterator[StreamEvent]) -> AsyncGenerator[ServerSentEvent, None]:
    """convert agent stream events into server-sent events and forward them to the client"""

    async for event in event_stream:
        if isinstance(event, RunItemStreamEvent):
            if isinstance(event.item, ToolCallItem):
                event_type = "tool_call"
                event_data = {"tool_name": event.item.raw_item.name, "tool_call_id": event.item.raw_item.call_id, "tool_call_args": event.item.raw_item.arguments}
                yield ServerSentEvent(event=event_type, data=event_data)
            elif isinstance(event.item, ToolCallOutputItem):
                event_type = "tool_call_output"
                event_data = {"tool_call_id": event.item.raw_item["call_id"], "tool_call_output": event.item.raw_item["output"]}
                yield ServerSentEvent(event=event_type, data=event_data)
            elif isinstance(event.item, ReasoningItem):
                event_type = "reasoning"
                event_data = {"reasoning_id": event.item.raw_item.id, "reasoning_summary": event.item.raw_item.summary, "reasoning_content": event.item.raw_item.content}
                yield ServerSentEvent(event=event_type, data=event_data)
            elif isinstance(event.item, MessageOutputItem):
                event_type = "message_output"
                event_data = {"message_id": event.item.raw_item.id, "message_role": event.item.raw_item.role, "message_content": event.item.raw_item.content}
                yield ServerSentEvent(event=event_type, data=event_data)

# agent runs endpoint definitions
# -------------------------------

@router.post("/agent/runs", tags=["agent"])
async def run_agent(request: AgentRunRequest, db: AsyncSession = Depends(get_db)) -> EventSourceResponse:
    """create and execute a new agent run"""

    # fetch the relevant contract from the database and convert to pydantic for the run
    query = select(DBContract).where(DBContract.id == request.contract_id)
    result = await db.execute(query)
    dbcontract = result.scalar_one_or_none()
    if not dbcontract:
        raise HTTPException(status_code=404, detail="contract not found")
    contract = Contract.model_validate(dbcontract)

    # create the dependencies and execute the agent run
    run_id = uuid4()
    context = AgentContext(run_id=run_id, db=db, contract=contract)

    result = Runner.run_streamed(starting_agent=agent, input=request.message, context=context)
    return EventSourceResponse(handle_event_stream(result.stream_events()))
