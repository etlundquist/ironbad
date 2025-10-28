import re
import json
import logging

from uuid import UUID
from typing import Optional
from openai.types.responses import ResponseInputTextParam
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import ContractSectionType
from app.models import Contract as DBContract, ContractSection as DBContractSection
from app.common.schemas import ContractSectionNode, ContractSectionCitation
from app.features.contract_annotations.schemas import AnnotatedContract, Contract
from app.features.contract_agent.schemas import AgentContractSection, AgentRunRequest, AgentContractSectionTextSpan, AgentPrecedentDocument, AgentContractSectionPreview
from app.utils.embeddings import get_text_embedding
from app.utils.common import string_truncate


logger = logging.getLogger(__name__)


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


async def extract_response_citations(contract: AnnotatedContract, response_content: str) -> list[ContractSectionCitation]:
    """extract citations from a rule evaluation into structured citation objects referencing specific contract sections"""

    # find all square brackets containing at least one valid section number
    bracket_matches = re.findall(r'\[([0-9]+(?:\.[0-9]+)*(?:\s*,\s*[0-9]+(?:\.[0-9]+)*)*)\]', response_content)

    # extract the set of unique section numbers from the square bracket matches
    unique_section_numbers = set([section.strip() for match in bracket_matches for section in match.split(',')])

    # create a list of citation objects for each unique response section number that references a valid contract section
    response_citations: list[ContractSectionCitation] = []
    for section_number in unique_section_numbers:
        try:
            contract_section_node = contract.section_tree.get_node_by_id(section_number)
            response_citation = ContractSectionCitation(section_id=str(contract_section_node.id), section_number=contract_section_node.number)
            response_citations.append(response_citation)
        except ValueError:
            logger.warning(f"cited section number: [{section_number}] not found in the contract's parsed sections")
    return response_citations


async def process_request_attachments(db: AsyncSession, contract: AnnotatedContract, request: AgentRunRequest) -> list[ResponseInputTextParam]:
    """convert user message attachments into additional text-based content blocks for the model input"""

    # initialize a list of content blocks for the attachments content
    content_blocks: list[ResponseInputTextParam] = []

    # retrieve any pinned sections specified in the request attachments
    pinned_section_attachments = [attachment for attachment in request.attachments if attachment.kind == "pinned_section"]
    if pinned_section_attachments:
        agent_sections: list[AgentContractSection] = []
        for section in pinned_section_attachments:
            node = contract.section_tree.get_node_by_id(node_id=section.section_number)
            agent_section = AgentContractSection(type=node.type, level=node.level, section_number=node.number, section_text=node.markdown)
            agent_sections.append(agent_section)
        pinned_sections = json.dumps([json.loads(section.model_dump_json()) for section in agent_sections], indent=2)
    else:
        pinned_sections = None

    # retrieve any pinned section text spans specified in the request attachments
    pinned_section_text_attachments = [attachment for attachment in request.attachments if attachment.kind == "pinned_section_text"]
    if pinned_section_text_attachments:
        agent_section_text_spans: list[AgentContractSectionTextSpan] = []
        for section in pinned_section_text_attachments:
            agent_section_text_span = AgentContractSectionTextSpan(section_number=section.section_number, text_span=section.text_span)
            agent_section_text_spans.append(agent_section_text_span)
        pinned_section_text_spans = json.dumps([json.loads(span.model_dump_json()) for span in agent_section_text_spans], indent=2)
    else:
        pinned_section_text_spans = None

    # retrieve any pinned precedent documents specified in the request attachments
    pinned_precedent_document_attachments = [attachment for attachment in request.attachments if attachment.kind == "pinned_precedent_document"]
    if pinned_precedent_document_attachments:
        agent_precedent_documents: list[AgentPrecedentDocument] = []
        for document in pinned_precedent_document_attachments:
            precedent_dbcontract = await db.get(DBContract, document.contract_id)
            precedent_contract = AnnotatedContract.model_validate(precedent_dbcontract)
            precedent_top_level_sections = flatten_section_tree(precedent_contract.section_tree, max_depth=1)
            precedent_top_level_sections = [
                AgentContractSectionPreview(
                    type=section.type, 
                    level=section.level, 
                    section_number=section.number, 
                    section_text_preview=string_truncate(string=section.markdown, max_tokens=50)
                ) for section in precedent_top_level_sections
            ]
            agent_precedent_document = AgentPrecedentDocument(name=precedent_contract.filename, summary=precedent_contract.meta.summary, top_level_sections=precedent_top_level_sections)
            agent_precedent_documents.append(agent_precedent_document)
        pinned_precedent_documents = json.dumps([json.loads(document.model_dump_json()) for document in agent_precedent_documents], indent=2)
    else:
        pinned_precedent_documents = None

    # add any additional attachment-based content blocks to the attachments content list
    if pinned_sections:
        content_block = ResponseInputTextParam(type="input_text", text=f"## Contract Section Attachments\n{pinned_sections}")
        content_blocks.append(content_block)
    if pinned_section_text_spans:
        content_block = ResponseInputTextParam(type="input_text", text=f"## Contract Section Text Span Attachments\n{pinned_section_text_spans}")
        content_blocks.append(content_block)
    if pinned_precedent_documents:
        content_block = ResponseInputTextParam(type="input_text", text=f"## Precedent Document Attachments\n{pinned_precedent_documents}")
        content_blocks.append(content_block)

    # return the list of content blocks
    return content_blocks
