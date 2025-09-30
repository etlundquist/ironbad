import logging
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ContractIssue as DBContractIssue, Contract as DBContract
from app.schemas import ContractIssue
from app.database import get_db
from app.enums import IssueResolution

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
        query = select(DBContractIssue).where(DBContractIssue.contract_id == contract_id)
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
    return NotImplementedError


@router.put("/contracts/{contract_id}/issues/{issue_id}/user-revision", response_model=ContractIssue, tags=["contract_issues"])
async def update_contract_issue_user_revision(contract_id: UUID, issue_id: UUID, user_revision: str, db: AsyncSession = Depends(get_db)) -> ContractIssue:
    """update the issue's active revision with a manual edit"""
    return NotImplementedError


@router.post("/contracts/{contract_id}/issues/{issue_id}/resolve", response_model=ContractIssue, tags=["contract_issues"])
async def resolve_contract_issue(contract_id: UUID, issue_id: UUID, resolution: IssueResolution, db: AsyncSession = Depends(get_db)) -> ContractIssue:
    """resolve the issue by either ignoring it or submitting the active suggested revision"""
    return NotImplementedError
