import logging
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from openai import AsyncOpenAI
from openai.types.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import ContractIssue as DBContractIssue, Contract as DBContract, StandardClause
from app.features.contract_issues.schemas import ContractIssue, ContractIssueUserRevision
from app.api.deps import get_db
from app.enums import  IssueResolution, IssueStatus
from app.prompts import PROMPT_CONTRACT_ISSUE_REVISION


router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/contracts/{contract_id}/issues", response_model=list[ContractIssue], tags=["contract_issues"])
async def get_contract_issues(contract_id: UUID, db: AsyncSession = Depends(get_db), status: Optional[str] = None) -> list[ContractIssue]:
    """get all issues for a specific contract"""

    try:
        contract_query = select(DBContract).where(DBContract.id == contract_id)
        contract_result = await db.execute(contract_query)
        contract = contract_result.scalar_one_or_none()
        if not contract:
            raise HTTPException(status_code=404, detail="contract not found")
        query = select(DBContractIssue).where(DBContractIssue.contract_id == contract_id).options(
            selectinload(DBContractIssue.standard_clause),
            selectinload(DBContractIssue.standard_clause_rule)
        )
        if status:
            try:
                from app.enums import IssueStatus
                issue_status = IssueStatus(status)
                query = query.where(DBContractIssue.status == issue_status)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"invalid status: {status}")

        result = await db.execute(query)
        issues = result.scalars().all()
        return [ContractIssue.model_validate(issue) for issue in issues]
    except HTTPException:
        raise
    except Exception as e:
        logger.error("failed to fetch contract issues", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/contracts/{contract_id}/issues/{issue_id}", response_model=ContractIssue, tags=["contract_issues"])
async def get_contract_issue(contract_id: UUID, issue_id: UUID, db: AsyncSession = Depends(get_db)) -> ContractIssue:
    """get a specific issue for a contract by ID"""

    try:
        contract_query = select(DBContract).where(DBContract.id == contract_id)
        contract_result = await db.execute(contract_query)
        contract = contract_result.scalar_one_or_none()
        if not contract:
            raise HTTPException(status_code=404, detail="contract not found")

        query = select(DBContractIssue).where(
            DBContractIssue.id == issue_id,
            DBContractIssue.contract_id == contract_id
        ).options(
            selectinload(DBContractIssue.standard_clause),
            selectinload(DBContractIssue.standard_clause_rule)
        )
        result = await db.execute(query)
        issue = result.scalar_one_or_none()
        if not issue:
            raise HTTPException(status_code=404, detail="issue not found")
        return ContractIssue.model_validate(issue)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("failed to fetch contract issue", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/contracts/{contract_id}/issues/{issue_id}/ai-revision", response_model=ContractIssue, tags=["contract_issues"])
async def update_contract_issue_ai_revision(contract_id: UUID, issue_id: UUID, db: AsyncSession = Depends(get_db)) -> ContractIssue:
    """update the issue's active revision with an AI suggestion"""

    # fetch the contract issue from the database
    query = select(DBContractIssue).where(DBContractIssue.contract_id == contract_id, DBContractIssue.id == issue_id).options(
        selectinload(DBContractIssue.standard_clause),
        selectinload(DBContractIssue.standard_clause_rule)
    )
    result = await db.execute(query)
    issue = result.scalar_one_or_none()
    if not issue:
        raise HTTPException(status_code=404, detail="issue not found")

    # fetch the relevant standard clause text and standard clause rules to provide guidance for suggested revisions
    query = select(StandardClause).where(StandardClause.id == issue.standard_clause_id).options(selectinload(StandardClause.rules))
    result = await db.execute(query)
    standard_clause = result.scalar_one_or_none()

    # generate a suggested revision for the issue
    openai = AsyncOpenAI()
    resolved_prompt = PROMPT_CONTRACT_ISSUE_REVISION.format(
        clause_name=standard_clause.display_name,
        relevant_text=issue.relevant_text,
        issue_description=issue.explanation,
        policy_rules="\n".join([rule.text for rule in standard_clause.rules]),
        standard_approved_language=standard_clause.standard_text
    )
    logger.info(f"resolved prompt: {resolved_prompt}")

    response: Response = await openai.responses.create(
        model="gpt-4.1",
        input=resolved_prompt,
        temperature=0.5,
        timeout=60
    )
    suggested_revision = response.output_text
    logger.info(f"suggested revision: {suggested_revision}")

    # save the suggested revision to the database updating the active revision
    issue.ai_suggested_revision = suggested_revision
    issue.active_suggested_revision = suggested_revision
    await db.commit()
    await db.refresh(issue)
    return ContractIssue.model_validate(issue)


@router.put("/contracts/{contract_id}/issues/{issue_id}/user-revision", response_model=ContractIssue, tags=["contract_issues"])
async def update_contract_issue_user_revision(contract_id: UUID, issue_id: UUID, user_revision: ContractIssueUserRevision, db: AsyncSession = Depends(get_db)) -> ContractIssue:
    """update the issue's active revision with a manual edit"""

    # fetch the issue from the database
    query = select(DBContractIssue).where(DBContractIssue.contract_id == contract_id, DBContractIssue.id == issue_id).options(
        selectinload(DBContractIssue.standard_clause),
        selectinload(DBContractIssue.standard_clause_rule)
    )
    result = await db.execute(query)
    issue = result.scalar_one_or_none()
    if not issue:
        raise HTTPException(status_code=404, detail="issue not found")

    # save the user revision to the database updating the active revision
    issue.user_suggested_revision = user_revision.user_suggested_revision
    issue.active_suggested_revision = user_revision.user_suggested_revision
    await db.commit()
    await db.refresh(issue)
    return ContractIssue.model_validate(issue)


@router.post("/contracts/{contract_id}/issues/{issue_id}/resolve", response_model=ContractIssue, tags=["contract_issues"])
async def resolve_contract_issue(contract_id: UUID, issue_id: UUID, resolution: IssueResolution, db: AsyncSession = Depends(get_db)) -> ContractIssue:
    """resolve the issue by either ignoring it or submitting the active suggested revision"""

    # fetch the issue from the database
    query = select(DBContractIssue).where(DBContractIssue.contract_id == contract_id, DBContractIssue.id == issue_id).options(
        selectinload(DBContractIssue.standard_clause),
        selectinload(DBContractIssue.standard_clause_rule)
    )
    result = await db.execute(query)
    issue = result.scalar_one_or_none()
    if not issue:
        raise HTTPException(status_code=404, detail="issue not found")

    # clear the active suggested revision if the resolution method is to ignore the issue
    if resolution == IssueResolution.IGNORE:
        issue.active_suggested_revision = None

    # mark the issue as resolved and note the resolution
    issue.status = IssueStatus.RESOLVED
    issue.resolution = resolution
    await db.commit()
    await db.refresh(issue)
    return ContractIssue.model_validate(issue)


@router.post("/contracts/{contract_id}/issues/{issue_id}/unresolve", response_model=ContractIssue, tags=["contract_issues"])
async def unresolve_contract_issue(contract_id: UUID, issue_id: UUID, db: AsyncSession = Depends(get_db)) -> ContractIssue:
    """unresolve the issue"""

    # fetch the issue from the database
    query = select(DBContractIssue).where(DBContractIssue.contract_id == contract_id, DBContractIssue.id == issue_id).options(
        selectinload(DBContractIssue.standard_clause),
        selectinload(DBContractIssue.standard_clause_rule)
    )
    result = await db.execute(query)
    issue = result.scalar_one_or_none()
    if not issue:
        raise HTTPException(status_code=404, detail="issue not found")

    # mark the issue as unresolved and clear the resolution
    issue.status = IssueStatus.OPEN
    issue.resolution = None
    await db.commit()
    await db.refresh(issue)
    return ContractIssue.model_validate(issue)
