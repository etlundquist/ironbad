import logging
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Contract as DBContract, ContractSection as DBContractSection
from app.schemas import ContractSection
from app.enums import ContractSectionType
from app.database import get_db

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/contracts/{contract_id}/sections", response_model=list[ContractSection], tags=["contract_sections"])
async def get_contract_sections(
    contract_id: UUID,
    db: AsyncSession = Depends(get_db),
    type: Optional[ContractSectionType] = None,
    level: Optional[int] = None,
    offset: int = 0,
    limit: int = 100
) -> list[ContractSection]:
    """fetch all contract sections for a contract with optional filtering and pagination"""

    try:
        # verify contract exists
        contract_query = select(DBContract).where(DBContract.id == contract_id)
        contract_result = await db.execute(contract_query)
        contract = contract_result.scalar_one_or_none()
        if not contract:
            raise HTTPException(status_code=404, detail="contract not found")

        # build query with optional filters
        query = select(DBContractSection).where(DBContractSection.contract_id == contract_id)
        if type:
            query = query.where(DBContractSection.type == type)
        if level:
            query = query.where(DBContractSection.level == level)

        # apply pagination and ordering and return the results
        query = query.order_by(DBContractSection.number).offset(offset).limit(limit)
        result = await db.execute(query)
        contract_sections = result.scalars().all()
        return [ContractSection.model_validate(section) for section in contract_sections]
    except HTTPException:
        raise
    except Exception as e:
        logger.error("failed to fetch contract sections", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/contracts/{contract_id}/sections/{section_id}", response_model=ContractSection, tags=["contract_sections"])
async def get_contract_section(contract_id: UUID, section_id: UUID, db: AsyncSession = Depends(get_db)) -> ContractSection:
    """fetch a specific contract section by ID"""

    try:
        # verify contract exists
        contract_query = select(DBContract).where(DBContract.id == contract_id)
        contract_result = await db.execute(contract_query)
        contract = contract_result.scalar_one_or_none()
        if not contract:
            raise HTTPException(status_code=404, detail="contract not found")

        # fetch the contract section
        query = select(DBContractSection).where(
            DBContractSection.contract_id == contract_id,
            DBContractSection.id == section_id
        )
        result = await db.execute(query)
        contract_section = result.scalar_one_or_none()
        if not contract_section:
            raise HTTPException(status_code=404, detail="contract section not found")
        return ContractSection.model_validate(contract_section)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("failed to fetch contract section", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
