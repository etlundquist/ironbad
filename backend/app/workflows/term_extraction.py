import asyncio
import logging

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openai import AsyncOpenAI
from openai.types.responses import Response, ParsedResponse

from app.dbmodels import Contract, StandardTerm, ContractSection, ContractTerm
from app.models import SectionRelevanceEvaluation
from app.prompts import PROMPT_SECTION_RELEVANCE, PROMPT_TERM_SUMMARY


logger = logging.getLogger(__name__)


async def load_standard_terms(db: AsyncSession) -> list[StandardTerm]:
    """load the standard terms from the database"""

    result = await db.execute(select(StandardTerm))
    return result.scalars().all()


async def load_contract_sections(db: AsyncSession, contract_id: UUID) -> list[ContractSection]:
    """load the contract sections from the database"""

    result = await db.execute(select(ContractSection).where(ContractSection.contract_id == contract_id))
    return result.scalars().all()


async def get_term_section_candidates(db: AsyncSession, term: StandardTerm, contract_id: UUID, k: int = 10) -> list[ContractSection]:
    """get the best-matching contract sections using embedding similarity"""

    if term.embedding is None:
        return []

    statement = (
        select(ContractSection)
        .where(ContractSection.contract_id == contract_id)
        .where(ContractSection.embedding.is_not(None))
        .order_by(ContractSection.embedding.op("<=>")(term.embedding))
        .limit(k)
    )

    result = await db.execute(statement)
    return result.scalars().all()


async def evaluate_term_section_relevance(term: StandardTerm, section: ContractSection) -> SectionRelevanceEvaluation:
    """evaluate the relevance of a single contract section wrt a standard term"""

    openai = AsyncOpenAI()
    standard_term_text = f"Name: {term.display_name}\nDescription: {term.description}"
    input_section_text = section.markdown

    response: ParsedResponse = await openai.responses.parse(
        model="gpt-4.1-mini",
        input=PROMPT_SECTION_RELEVANCE.format(standard_clause=standard_term_text, contract_section=input_section_text),
        text_format=SectionRelevanceEvaluation,
        temperature=0.0,
        timeout=60
    )
    result: SectionRelevanceEvaluation= response.output_parsed

    logger.info(f"relevance evaluation: term={term.name} section={section.number} {section.name} result={result.model_dump()}")
    return result


async def evaluate_term_section_candidates(term: StandardTerm, sections: list[ContractSection]) -> list[ContractSection]:
    """determine which of the candidate sections are relevant to the standard term using LLM classification"""

    evaluation_results = await asyncio.gather(*[evaluate_term_section_relevance(term, section) for section in sections])
    matching_sections = [section for section, result in zip(sections, evaluation_results) if result.match]

    logger.info(f"{len(matching_sections)} identified for term={term.name}")
    return matching_sections


async def extract_contract_term(db: AsyncSession, contract: Contract, term: StandardTerm) -> ContractTerm:
    """assemble a contract-specific standard term based on the relevant contract sections"""

    # get the initial list of candidate sections for the term using embedding similarity
    candidate_sections = await get_term_section_candidates(db=db, term=term, contract_id=contract.id)

    # identify the subset of relevant sections for the term using LLM classification
    matching_sections = await evaluate_term_section_candidates(term, candidate_sections)
    if not matching_sections:
        logger.warning(f"no matching sections found for term={term.name} - skipping contract-specific term creation")
        return None

    # assemble the standard term raw text (raw appended sections ordered by section number)
    raw_markdown = "\n".join([section.markdown for section in sorted(matching_sections, key=lambda x: x.number)])

    # assemble the standard term summarized text (LLM-generated summary of the raw text)
    openai = AsyncOpenAI()
    response: Response = await openai.responses.create(
        model="gpt-4.1-mini",
        input=PROMPT_TERM_SUMMARY.format(
            standard_clause=f"Name: {term.display_name}\nDescription: {term.description}",
            contract_sections=raw_markdown
        ),
        temperature=0.0,
        timeout=60
    )
    cleaned_markdown = response.output_text

    # add the contract term to the database
    contract_term = ContractTerm(
        standard_term_id=term.id,
        contract_id=contract.id,
        contract_sections=[section.id for section in matching_sections],
        raw_markdown=raw_markdown,
        cleaned_markdown=cleaned_markdown
    )
    return contract_term


async def extract_contract_terms(db: AsyncSession, contract: Contract, standard_terms: list[StandardTerm]) -> None:
    """extract all standard terms from the input contract"""

    contract_terms: list[ContractTerm] = []
    for term in standard_terms:
        logger.info(f"*** extracting term: {term.name} ***")
        contract_term = await extract_contract_term(db, contract, term)
        if contract_term:
            contract_terms.append(contract_term)

    db.add_all(contract_terms)
    await db.flush()
