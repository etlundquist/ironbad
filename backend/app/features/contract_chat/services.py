import re
import logging

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ContractSection
from app.enums import ContractSectionType
from app.features.contract_chat.schemas import ContractSectionCitation

from app.utils.embeddings import get_text_embedding
from app.utils.common import count_tokens


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



