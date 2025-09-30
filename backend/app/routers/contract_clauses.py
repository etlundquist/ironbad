import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Contract as DBContract, ContractClause as DBContractClause
from app.schemas import ContractClause
from app.database import get_db

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/contracts/{contract_id}/clauses", response_model=list[ContractClause], tags=["contract_clauses"])
async def get_contract_clauses(contract_id: UUID, db: AsyncSession = Depends(get_db)) -> list[ContractClause]:
    """fetch all contract-specific standard clauses for a contract"""

    try:
        # verify contract exists
        contract_query = select(DBContract).where(DBContract.id == contract_id)
        contract_result = await db.execute(contract_query)
        contract = contract_result.scalar_one_or_none()
        if not contract:
            raise HTTPException(status_code=404, detail="contract not found")

        # fetch all contract clauses for this contract
        query = select(DBContractClause).where(DBContractClause.contract_id == contract_id).options(selectinload(DBContractClause.standard_clause))
        result = await db.execute(query)
        contract_clauses = result.scalars().all()
        return [ContractClause.model_validate(clause) for clause in contract_clauses]
    except HTTPException:
        raise
    except Exception as e:
        logger.error("failed to fetch contract clauses", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/contracts/{contract_id}/clause", response_model=ContractClause, tags=["contract_clauses"])
async def get_contract_clause(
    contract_id: UUID,
    db: AsyncSession = Depends(get_db),
    standard_clause_id: UUID = None,
    contract_clause_id: UUID = None
) -> ContractClause:
    """fetch a contract-specific standard clause by either standard_clause_id or contract_clause_id query parameter"""

    if (not standard_clause_id and not contract_clause_id) or (standard_clause_id and contract_clause_id):
        raise HTTPException(status_code=400, detail="must provide either standard_clause_id or contract_clause_id query parameter but not both")

    try:
        # verify contract exists
        contract_query = select(DBContract).where(DBContract.id == contract_id)
        contract_result = await db.execute(contract_query)
        contract = contract_result.scalar_one_or_none()
        if not contract:
            raise HTTPException(status_code=404, detail="contract not found")

        # fetch the contract clause based on the provided query parameter
        if standard_clause_id:
            query = select(DBContractClause).where(
                DBContractClause.contract_id == contract_id,
                DBContractClause.standard_clause_id == standard_clause_id
            ).options(selectinload(DBContractClause.standard_clause))
        else:
            query = select(DBContractClause).where(
                DBContractClause.contract_id == contract_id,
                DBContractClause.id == contract_clause_id
            ).options(selectinload(DBContractClause.standard_clause))
        result = await db.execute(query)
        contract_clause = result.scalar_one_or_none()
        if not contract_clause:
            raise HTTPException(status_code=404)
        return ContractClause.model_validate(contract_clause)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("failed to fetch contract clause", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
