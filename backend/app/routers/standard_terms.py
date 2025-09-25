import re
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.dbmodels import StandardTerm as DBStandardTerm
from app.models import StandardTerm, StandardTermCreate, StandardTermUpdate
from app.database import get_db
from app.embeddings import get_text_embedding

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/standard_terms", response_model=StandardTerm, tags=["standard_terms"])
async def create_standard_term(request: StandardTermCreate, db: AsyncSession = Depends(get_db)) -> StandardTerm:
    """add a new standard term to the database"""

    request.name = request.name.lower()
    if not re.match(r'^[A-Z0-9_-]+$', request.name, flags=re.IGNORECASE):
        raise HTTPException(status_code=400, detail="standard term names must contain only letters, numbers, underscores, and dashes")

    try:
        standard_term = DBStandardTerm(**request.model_dump())
        standard_term.embedding = await get_text_embedding(text=f"{standard_term.display_name}\n{standard_term.standard_text}")
        db.add(standard_term)
        await db.commit()
        await db.refresh(standard_term)
        return StandardTerm.model_validate(standard_term)
    except IntegrityError:
        await db.rollback()
        logger.error("failed to create standard term", exc_info=True)
        raise HTTPException(status_code=409, detail="standard term with this `name` already exists")
    except Exception as e:
        await db.rollback()
        logger.error("failed to create standard term", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/standard_terms", response_model=list[StandardTerm], tags=["standard_terms"])
async def get_standard_terms(db: AsyncSession = Depends(get_db)) -> list[StandardTerm]:
    """fetch all standard terms from the database"""

    try:
        query = select(DBStandardTerm)
        result = await db.execute(query)
        standard_terms = result.scalars().all()
        return [StandardTerm.model_validate(term) for term in standard_terms]
    except Exception as e:
        logger.error("failed to fetch standard terms", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/standard_terms/{term_id}", response_model=StandardTerm, tags=["standard_terms"])
async def get_standard_term(term_id: UUID, db: AsyncSession = Depends(get_db)) -> StandardTerm:
    """fetch a single standard term by ID"""

    try:
        query = select(DBStandardTerm).where(DBStandardTerm.id == term_id)
        result = await db.execute(query)
        standard_term = result.scalar_one_or_none()
        if not standard_term:
            raise HTTPException(status_code=404, detail="standard term not found")
        return StandardTerm.model_validate(standard_term)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("failed to fetch standard term", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/standard_terms/{term_id}", response_model=StandardTerm, tags=["standard_terms"])
async def update_standard_term(term_id: UUID, request: StandardTermUpdate, db: AsyncSession = Depends(get_db)) -> StandardTerm:
    """update a specific standard term by ID"""

    try:
        query = select(DBStandardTerm).where(DBStandardTerm.id == term_id)
        result = await db.execute(query)
        standard_term = result.scalar_one_or_none()
        if not standard_term:
            raise HTTPException(status_code=404, detail="standard term not found")
        update_data = request.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(standard_term, field, value)
        if ("display_name" in update_data) or ("standard_text" in update_data):
            standard_term.embedding = await get_text_embedding(text=f"{standard_term.display_name}\n{standard_term.standard_text}")
        await db.commit()
        await db.refresh(standard_term)
        return StandardTerm.model_validate(standard_term)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error("failed to update standard term", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/standard_terms/{term_id}", tags=["standard_terms"])
async def delete_standard_term(term_id: UUID, db: AsyncSession = Depends(get_db)) -> Response:
    """delete a specific standard term by ID"""

    try:
        query = select(DBStandardTerm).where(DBStandardTerm.id == term_id)
        result = await db.execute(query)
        standard_term = result.scalar_one_or_none()
        if not standard_term:
            raise HTTPException(status_code=404, detail="standard term not found")
        await db.delete(standard_term)
        await db.commit()
        return Response(status_code=204)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error("failed to delete standard term", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
