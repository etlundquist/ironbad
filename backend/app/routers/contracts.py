import io
import logging

from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, Response, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.dbmodels import Contract as DBContract
from app.models import Contract

from app.database import get_db
from app.enums import ContractStatus, FileType

from app.constants import MAX_UPLOAD_FILE_SIZE


router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/contracts", response_model=Contract, tags=["contracts"])
async def upload_contract(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)) -> Contract:
    """create a new contract record storing the file contents in binary format"""

    try:
        contents = await file.read()
        filetype = FileType(file.content_type)

        if file.size > MAX_UPLOAD_FILE_SIZE:
            raise HTTPException(status_code=413, detail="upload file size exceeds the limit (10MB)")

        contract = DBContract(
            status=ContractStatus.UPLOADED,
            filename=file.filename,
            filetype=filetype,
            contents=contents,
        )

        db.add(contract)
        await db.commit()
        await db.refresh(contract)
        return Contract.model_validate(contract)

    except HTTPException:
        raise

    except IntegrityError:
        await db.rollback()
        logger.error("a contract with the same filename already exists", exc_info=True)
        raise HTTPException(status_code=409, detail="a contract with the same filename already exists")

    except Exception as e:
        await db.rollback()
        logger.error("failed to upload contract", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/contracts", response_model=list[Contract], tags=["contracts"])
async def get_contracts(
    db: AsyncSession = Depends(get_db),
    status: Optional[ContractStatus] = None,
    order_by: str = "created_at",
    offset: int = 0,
    limit: int = 100
) -> list[Contract]:
    """fetch metadata for all contracts from the database"""

    try:
        query = select(DBContract)

        # filter by contract status if provided as a query parameter
        if status:
            query = query.where(DBContract.status == status)

        # order by specified field if provided as a query parameter
        if hasattr(DBContract, order_by):
            order_column = getattr(DBContract, order_by)
            query = query.order_by(order_column.desc())

        # apply pagination (default is most recent 100 contracts)
        query = query.offset(offset).limit(limit)

        result = await db.execute(query)
        contracts = result.scalars().all()
        return [Contract.model_validate(contract) for contract in contracts]
    except HTTPException:
        raise
    except Exception as e:
        logger.error("failed to fetch contracts", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/contracts/{contract_id}", response_model=Contract, tags=["contracts"])
async def get_contract(contract_id: UUID, db: AsyncSession = Depends(get_db)):
    """fetch a single contract by ID"""

    try:
        query = select(DBContract).where(DBContract.id == contract_id)
        result = await db.execute(query)
        contract = result.scalar_one_or_none()
        if not contract:
            raise HTTPException(status_code=404, detail="contract not found")
        return Contract.model_validate(contract)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("failed to fetch contract", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/contracts/{contract_id}/contents", tags=["contracts"])
async def get_contract_contents(contract_id: UUID, db: AsyncSession = Depends(get_db)) -> StreamingResponse:
    """fetch the contents of a contract by ID"""

    try:
        query = select(DBContract).where(DBContract.id == contract_id)
        result = await db.execute(query)
        contract = result.scalar_one_or_none()
        if not contract:
            raise HTTPException(status_code=404, detail="contract not found")
        headers = {"Content-Disposition": f'attachment; filename="{contract.filename}"', "Content-Length": str(len(contract.contents))}
        return StreamingResponse(content=io.BytesIO(contract.contents), media_type=contract.filetype.value, headers=headers)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("failed to fetch contract contents", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/contracts/{contract_id}", response_model=Contract, tags=["contracts"])
async def update_contract_metadata(contract_id: UUID, metadata: dict, db: AsyncSession = Depends(get_db)) -> Contract:
    """update/refresh the metadata for a contract by ID"""

    try:
        query = select(DBContract).where(DBContract.id == contract_id)
        result = await db.execute(query)
        contract = result.scalar_one_or_none()
        if not contract:
            raise HTTPException(status_code=404, detail="contract not found")
        contract.meta = metadata
        await db.commit()
        await db.refresh(contract)
        return Contract.model_validate(contract)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error("failed to update contract metadata", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/contracts/{contract_id}", tags=["contracts"])
async def delete_contract(contract_id: UUID, db: AsyncSession = Depends(get_db)) -> Response:
    """delete a contract by ID"""

    try:
        query = select(DBContract).where(DBContract.id == contract_id)
        result = await db.execute(query)
        contract = result.scalar_one_or_none()
        if not contract:
            raise HTTPException(status_code=404, detail="contract not found")
        await db.delete(contract)
        await db.commit()
        return Response(status_code=200)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error("failed to delete contract", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
