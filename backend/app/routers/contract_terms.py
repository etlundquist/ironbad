import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dbmodels import Contract as DBContract, ContractTerm as DBContractTerm
from app.models import ContractTerm
from app.database import get_db

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/contracts/{contract_id}/terms", response_model=list[ContractTerm], tags=["contract_terms"])
async def get_contract_terms(contract_id: UUID, db: AsyncSession = Depends(get_db)) -> list[ContractTerm]:
    """fetch all contract-specific standard terms for a contract"""

    try:
        # verify contract exists
        contract_query = select(DBContract).where(DBContract.id == contract_id)
        contract_result = await db.execute(contract_query)
        contract = contract_result.scalar_one_or_none()
        if not contract:
            raise HTTPException(status_code=404, detail="contract not found")

        # fetch all contract terms for this contract
        query = select(DBContractTerm).where(DBContractTerm.contract_id == contract_id)
        result = await db.execute(query)
        contract_terms = result.scalars().all()
        return [ContractTerm.model_validate(term) for term in contract_terms]
    except HTTPException:
        raise
    except Exception as e:
        logger.error("failed to fetch contract terms", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/contracts/{contract_id}/term", response_model=ContractTerm, tags=["contract_terms"])
async def get_contract_term(
    contract_id: UUID,
    db: AsyncSession = Depends(get_db),
    standard_term_id: UUID = None,
    contract_term_id: UUID = None
) -> ContractTerm:
    """fetch a contract-specific standard term by either standard_term_id or contract_term_id query parameter"""

    if (not standard_term_id and not contract_term_id) or (standard_term_id and contract_term_id):
        raise HTTPException(status_code=400, detail="must provide either standard_term_id or contract_term_id query parameter but not both")

    try:
        # verify contract exists
        contract_query = select(DBContract).where(DBContract.id == contract_id)
        contract_result = await db.execute(contract_query)
        contract = contract_result.scalar_one_or_none()
        if not contract:
            raise HTTPException(status_code=404, detail="contract not found")

        # fetch the contract term based on the provided query parameter
        if standard_term_id:
            query = select(DBContractTerm).where(
                DBContractTerm.contract_id == contract_id,
                DBContractTerm.standard_term_id == standard_term_id
            )
        else:
            query = select(DBContractTerm).where(
                DBContractTerm.contract_id == contract_id,
                DBContractTerm.id == contract_term_id
            )

        result = await db.execute(query)
        contract_term = result.scalar_one_or_none()
        if not contract_term:
            raise HTTPException(status_code=404)
        return ContractTerm.model_validate(contract_term)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("failed to fetch contract term", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
