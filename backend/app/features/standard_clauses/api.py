import re
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import StandardClause as DBStandardClause
from app.features.standard_clauses.schemas import StandardClause, StandardClauseCreate, StandardClauseUpdate
from app.api.deps import get_db
from app.utils.embeddings import get_text_embedding


router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/standard_clauses", response_model=StandardClause, tags=["standard_clauses"])
async def create_standard_clause(request: StandardClauseCreate, db: AsyncSession = Depends(get_db)) -> StandardClause:
    """add a new standard clause to the database"""

    request.name = request.name.lower()
    if not re.match(r'^[A-Z0-9_-]+$', request.name, flags=re.IGNORECASE):
        raise HTTPException(status_code=400, detail="standard clause names must contain only letters, numbers, underscores, and dashes")

    try:
        standard_clause = DBStandardClause(**request.model_dump())
        standard_clause.embedding = await get_text_embedding(text=f"{standard_clause.display_name}\n{standard_clause.standard_text}")
        db.add(standard_clause)
        await db.commit()
        await db.refresh(standard_clause)
        return StandardClause.model_validate(standard_clause)
    except IntegrityError:
        await db.rollback()
        logger.error("failed to create standard clause", exc_info=True)
        raise HTTPException(status_code=409, detail="standard clause with this `name` already exists")
    except Exception as e:
        await db.rollback()
        logger.error("failed to create standard clause", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/standard_clauses", response_model=list[StandardClause], tags=["standard_clauses"])
async def get_standard_clauses(db: AsyncSession = Depends(get_db)) -> list[StandardClause]:
    """fetch all standard clauses from the database"""

    try:
        query = select(DBStandardClause).options(selectinload(DBStandardClause.rules))
        result = await db.execute(query)
        standard_clauses = result.scalars().all()
        return [StandardClause.model_validate(clause) for clause in standard_clauses]
    except Exception as e:
        logger.error("failed to fetch standard clauses", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/standard_clauses/{clause_id}", response_model=StandardClause, tags=["standard_clauses"])
async def get_standard_clause(clause_id: UUID, db: AsyncSession = Depends(get_db)) -> StandardClause:
    """fetch a single standard clause by ID"""

    try:
        query = select(DBStandardClause).where(DBStandardClause.id == clause_id).options(selectinload(DBStandardClause.rules))
        result = await db.execute(query)
        standard_clause = result.scalar_one_or_none()
        if not standard_clause:
            raise HTTPException(status_code=404, detail="standard clause not found")
        return StandardClause.model_validate(standard_clause)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("failed to fetch standard clause", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/standard_clauses/{clause_id}", response_model=StandardClause, tags=["standard_clauses"])
async def update_standard_clause(clause_id: UUID, request: StandardClauseUpdate, db: AsyncSession = Depends(get_db)) -> StandardClause:
    """update a specific standard clause by ID"""

    try:
        query = select(DBStandardClause).where(DBStandardClause.id == clause_id).options(selectinload(DBStandardClause.rules))
        result = await db.execute(query)
        standard_clause = result.scalar_one_or_none()
        if not standard_clause:
            raise HTTPException(status_code=404, detail="standard clause not found")
        update_data = request.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(standard_clause, field, value)
        if ("display_name" in update_data) or ("standard_text" in update_data):
            standard_clause.embedding = await get_text_embedding(text=f"{standard_clause.display_name}\n{standard_clause.standard_text}")
        await db.commit()
        await db.refresh(standard_clause)
        return StandardClause.model_validate(standard_clause)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error("failed to update standard clause", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/standard_clauses/{clause_id}", tags=["standard_clauses"])
async def delete_standard_clause(clause_id: UUID, db: AsyncSession = Depends(get_db)) -> Response:
    """delete a specific standard clause by ID"""

    try:
        query = select(DBStandardClause).where(DBStandardClause.id == clause_id)
        result = await db.execute(query)
        standard_clause = result.scalar_one_or_none()
        if not standard_clause:
            raise HTTPException(status_code=404, detail="standard clause not found")
        await db.delete(standard_clause)
        await db.commit()
        return Response(status_code=204)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error("failed to delete standard clause", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
