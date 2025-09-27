import logging

from uuid import UUID
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Contract as DBContract
from app.schemas import ContractAnalysisJob
from app.enums import ContractStatus, JobStatus
from app.database import get_db
from app.tasks import analyze_contract


router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/contracts/analyze", tags=["analysis"])
async def analyze_contracts(contract_ids: List[UUID], db: AsyncSession = Depends(get_db)) -> Response:
    """parse the raw contract file into a markdown string and set of structured section objects"""

    # fetch the set of contracts to analyze and make sure all of them are ready for review (parsed and ingested)
    query = select(DBContract).where(DBContract.id.in_(contract_ids), DBContract.status == ContractStatus.READY_FOR_REVIEW)
    result = await db.execute(query)
    contracts = result.scalars().all()
    if len(contracts) != len(contract_ids):
        logger.error("one or more requested contracts cannot be analyzed", exc_info=True)
        raise HTTPException(status_code=400, detail="one or more requested contracts cannot be analyzed")

    # trigger an analysis job for each contract in the request
    for contract in contracts:
        try:
            analysis_job = ContractAnalysisJob(contract_id=contract.id, status=JobStatus.QUEUED)
            await analyze_contract.kiq(analysis_job)
        except Exception:
            logger.error(f"failed to create analysis job for contract: {contract.id} ({contract.filename})", exc_info=True)
            raise HTTPException(status_code=500, detail="failed to create analysis job")

    # commit the contract status changes and return a response to the client if the jobs were queued successfully
    await db.commit()
    return Response(status_code=202)
