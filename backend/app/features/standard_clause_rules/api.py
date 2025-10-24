import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import StandardClause as DBStandardClause, StandardClauseRule as DBStandardClauseRule
from app.features.standard_clause_rules.schemas import StandardClauseRule, StandardClauseRuleCreate, StandardClauseRuleUpdate
from app.api.deps import get_db
from app.core.config import settings


router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/standard_clauses/{clause_id}/rules", response_model=StandardClauseRule, tags=["standard_clause_rules"])
async def create_standard_clause_rule(clause_id: UUID, request: StandardClauseRuleCreate, db: AsyncSession = Depends(get_db)) -> StandardClauseRule:
    """add a new rule to a standard clause"""

    # verify the standard clause exists
    clause_query = select(DBStandardClause).where(DBStandardClause.id == clause_id)
    clause_result = await db.execute(clause_query)
    standard_clause = clause_result.scalar_one_or_none()
    if not standard_clause:
        raise HTTPException(status_code=404, detail="standard clause not found")

    # check if the clause already has 10 rules (maximum allowed)
    rules_count_query = select(func.count(DBStandardClauseRule.id)).where(DBStandardClauseRule.standard_clause_id == clause_id)
    rules_count_result = await db.execute(rules_count_query)
    rules_count = rules_count_result.scalar()
    if rules_count > settings.max_standard_clause_rules:
        raise HTTPException(status_code=400, detail="each standard clause may have a maximum of 10 rules")

    try:
        rule = DBStandardClauseRule(standard_clause_id=clause_id, **request.model_dump())
        db.add(rule)
        await db.commit()
        await db.refresh(rule)
        return StandardClauseRule.model_validate(rule)
    except Exception as e:
        await db.rollback()
        logger.error("failed to create standard clause rule", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/standard_clauses/{clause_id}/rules", response_model=list[StandardClauseRule], tags=["standard_clause_rules"])
async def get_standard_clause_rules(clause_id: UUID, db: AsyncSession = Depends(get_db)) -> list[StandardClauseRule]:
    """fetch all rules for a specific standard clause"""

    # verify the standard clause exists
    clause_query = select(DBStandardClause).where(DBStandardClause.id == clause_id)
    clause_result = await db.execute(clause_query)
    standard_clause = clause_result.scalar_one_or_none()
    if not standard_clause:
        raise HTTPException(status_code=404, detail="standard clause not found")

    try:
        query = select(DBStandardClauseRule).where(DBStandardClauseRule.standard_clause_id == clause_id)
        result = await db.execute(query)
        rules = result.scalars().all()
        return [StandardClauseRule.model_validate(rule) for rule in rules]
    except Exception as e:
        logger.error("failed to fetch standard clause rules", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/standard_clauses/{clause_id}/rules/{rule_id}", response_model=StandardClauseRule, tags=["standard_clause_rules"])
async def get_standard_clause_rule(clause_id: UUID, rule_id: UUID, db: AsyncSession = Depends(get_db)) -> StandardClauseRule:
    """fetch a specific rule for a standard clause"""

    try:
        query = select(DBStandardClauseRule).where(DBStandardClauseRule.id == rule_id, DBStandardClauseRule.standard_clause_id == clause_id)
        result = await db.execute(query)
        rule = result.scalar_one_or_none()
        if not rule:
            raise HTTPException(status_code=404, detail="rule not found")
        return StandardClauseRule.model_validate(rule)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("failed to fetch standard clause rule", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/standard_clauses/{clause_id}/rules/{rule_id}", response_model=StandardClauseRule, tags=["standard_clause_rules"])
async def update_standard_clause_rule(clause_id: UUID, rule_id: UUID, request: StandardClauseRuleUpdate, db: AsyncSession = Depends(get_db)) -> StandardClauseRule:
    """update a specific rule for a standard clause"""

    try:
        query = select(DBStandardClauseRule).where(DBStandardClauseRule.id == rule_id, DBStandardClauseRule.standard_clause_id == clause_id)
        result = await db.execute(query)
        rule = result.scalar_one_or_none()
        if not rule:
            raise HTTPException(status_code=404, detail="rule not found")
        update_data = request.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(rule, field, value)
        await db.commit()
        await db.refresh(rule)
        return StandardClauseRule.model_validate(rule)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error("failed to update standard clause rule", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/standard_clauses/{clause_id}/rules/{rule_id}", tags=["standard_clause_rules"])
async def delete_standard_clause_rule(clause_id: UUID, rule_id: UUID, db: AsyncSession = Depends(get_db)) -> Response:
    """delete a specific rule for a standard clause"""

    try:
        query = select(DBStandardClauseRule).where(DBStandardClauseRule.id == rule_id, DBStandardClauseRule.standard_clause_id == clause_id)
        result = await db.execute(query)
        rule = result.scalar_one_or_none()
        if not rule:
            raise HTTPException(status_code=404, detail="rule not found")
        await db.delete(rule)
        await db.commit()
        return Response(status_code=204)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error("failed to delete standard clause rule", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
