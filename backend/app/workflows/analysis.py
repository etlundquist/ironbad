import re
import logging
import asyncio

from uuid import UUID
from openai import AsyncOpenAI
from openai.types.responses import ParsedResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Contract, StandardClause, StandardClauseRule, ContractSection, ContractClause, ContractIssue
from app.schemas import ClauseRuleEvaluation, EvaluatedClauseRule, ContractIssueCitation
from app.enums import IssueStatus
from app.prompts import PROMPT_RULE_COMPLIANCE_CLASSIFICATION

logging.basicConfig(level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)


async def evaluate_clause_rule(contract_clause: ContractClause, standard_clause: StandardClause, rule: StandardClauseRule) -> EvaluatedClauseRule:
    """evaluate a contract clause with respect to a single rule"""

    openai = AsyncOpenAI()
    response: ParsedResponse = await openai.responses.parse(
        model="gpt-4.1-mini",
        input=PROMPT_RULE_COMPLIANCE_CLASSIFICATION.format(
            clause_name=standard_clause.display_name,
            policy_rule=rule.text,
            contract_text=contract_clause.raw_markdown
        ),
        text_format=ClauseRuleEvaluation,
        temperature=0.0,
        timeout=60
    )
    evaluation: ClauseRuleEvaluation = response.output_parsed
    logger.info(f"evaluated rule: standard_clause={standard_clause.name} rule={rule.text}")
    logger.info(f"evaluation: {evaluation.model_dump()}")
    result = EvaluatedClauseRule(standard_clause_rule_id=rule.id, **evaluation.model_dump())
    return result


async def extract_violation_citations(db: AsyncSession, contract_id: UUID, violation: EvaluatedClauseRule) -> list[ContractIssueCitation]:
    """extract citations from a rule evaluation into structured citation objects referencing specific contract sections"""

    # if there are no citations then return an empty list for this violation
    if not violation.citations:
        return []

    # clean the raw section numbers from the rule evaluation result
    text_citations = violation.citations
    text_citations = [re.sub(r'[^0-9.]', '', section) for section in text_citations]
    text_citations = [re.sub(r'\.+$', '', section) for section in text_citations]

    # get the set of contract sections referenced by the citations
    query = select(ContractSection).where(ContractSection.contract_id == contract_id, ContractSection.number.in_(text_citations))
    result = await db.execute(query)
    contract_sections = result.scalars().all()
    contract_section_numbers = {section.number: section for section in contract_sections}

    citations: list[ContractIssueCitation] = []
    for text_citation in text_citations:
        if contract_section := contract_section_numbers.get(text_citation):
            citation = ContractIssueCitation(
                section_id=str(contract_section.id),
                section_number=contract_section.number,
                section_name=contract_section.name,
                beg_page=contract_section.beg_page,
                end_page=contract_section.end_page
            )
            citations.append(citation)

    return citations


async def identify_clause_issues(db: AsyncSession, contract_clause: ContractClause, standard_clause: StandardClause) -> list[ContractIssue]:
    """identify issues with a contract clause with respect to a standard clause"""

    # get the set of policy rules for the standard clause
    query = select(StandardClauseRule).where(StandardClauseRule.standard_clause_id == standard_clause.id)
    result = await db.execute(query)
    rules = result.scalars().all()

    # evaluate each rule independently with respect to the contract clause and filter for violations
    rule_evaluations = await asyncio.gather(*[evaluate_clause_rule(contract_clause, standard_clause, rule) for rule in rules])
    rule_violations = [evaluation for evaluation in rule_evaluations if evaluation.violation]

    # extract the citations for the rule violations mapping each citation back to the relevant contract section
    rule_violation_citations = await asyncio.gather(*[extract_violation_citations(db, contract_clause.contract_id, violation) for violation in rule_violations])

    # create contract issue objects for each rule violation
    clause_issues = [
        ContractIssue(
            standard_clause_id=standard_clause.id,
            standard_clause_rule_id=violation.standard_clause_rule_id,
            contract_id=contract_clause.contract_id,
            explanation=violation.explanation,
            citations=[citation.model_dump() for citation in citations],
            status=IssueStatus.OPEN,
        ) for violation, citations in zip(rule_violations, rule_violation_citations)
    ]
    return clause_issues


async def extract_issues(db: AsyncSession, contract: Contract, standard_clauses: list[StandardClause]) -> list[ContractIssue]:
    """identify contract issues with respect to a set of standard clauses and clause-specific policy rules"""

    contract_issues: list[ContractIssue] = []
    for standard_clause in standard_clauses:

        # fetch the contract-specific clause for the current standard clause
        logger.info(f"extracting issues for standard clause: {standard_clause.name}")
        query = select(ContractClause).where(ContractClause.contract_id == contract.id, ContractClause.standard_clause_id == standard_clause.id)
        result = await db.execute(query)
        contract_clause = result.scalar_one_or_none()

        # if the contract doesn't have a contract-specific clause for the current standard clause, skip issue identification
        if not contract_clause:
            logger.warning(f"no matching contract clause found for standard clause: {standard_clause.name} - skipping issue identification")
            continue

        # identify all issues (policy rule violations) with respect to the current standard clause and add to the contract issues
        clause_issues = await identify_clause_issues(db, contract_clause, standard_clause)
        contract_issues.extend(clause_issues)

    # return the full set of contract issues
    return contract_issues
