import logging

from uuid import UUID
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Contract as DBContract
from app.schemas import ContractIngestionJob
from app.enums import ContractStatus, JobStatus
from app.database import get_db
from app.tasks import ingest_contract


router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/contracts/ingest", tags=["ingestion"])
async def ingest_contracts(contract_ids: List[UUID], db: AsyncSession = Depends(get_db)) -> Response:
    """parse the raw contract file into a markdown string and set of structured section objects"""

    # fetch the set of contracts to ingest and ensure none of them are currently being ingested
    query = select(DBContract).where(DBContract.id.in_(contract_ids), DBContract.status.not_in([ContractStatus.PROCESSING]))
    result = await db.execute(query)
    contracts = result.scalars().all()
    if len(contracts) != len(contract_ids):
        logger.error("one or more requested contracts cannot be ingested", exc_info=True)
        raise HTTPException(status_code=400, detail="one or more requested contracts cannot be ingested")

    # update contract status to processing to prevent duplicate runs and queue each contract for ingestion
    for contract in contracts:
        try:
            contract.status = ContractStatus.PROCESSING
            ingestion_job = ContractIngestionJob(contract_id=contract.id, status=JobStatus.QUEUED)
            await ingest_contract.kiq(ingestion_job)
        except Exception:
            logger.error(f"failed to create ingestion job for contract: {contract.id} ({contract.filename})", exc_info=True)
            raise HTTPException(status_code=500, detail="failed to create ingestion job")

    # commit the contract status changes and return a response to the client if the jobs were queued successfully
    await db.commit()
    return Response(status_code=202)

