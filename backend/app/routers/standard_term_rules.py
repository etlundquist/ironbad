import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.dbmodels import StandardTerm as DBStandardTerm, StandardTermRule as DBStandardTermRule
from app.models import StandardTermRule, StandardTermRuleCreate, StandardTermRuleUpdate
from app.database import get_db
from app.constants import MAX_STANDARD_TERM_RULES


router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/standard_terms/{term_id}/rules", response_model=StandardTermRule, tags=["standard_term_rules"])
async def create_standard_term_rule(term_id: UUID, request: StandardTermRuleCreate, db: AsyncSession = Depends(get_db)) -> StandardTermRule:
    """add a new rule to a standard term"""

    # verify the standard term exists
    term_query = select(DBStandardTerm).where(DBStandardTerm.id == term_id)
    term_result = await db.execute(term_query)
    standard_term = term_result.scalar_one_or_none()
    if not standard_term:
        raise HTTPException(status_code=404, detail="standard term not found")

    # check if the term already has 10 rules (maximum allowed)
    rules_count_query = select(func.count(DBStandardTermRule.id)).where(DBStandardTermRule.standard_term_id == term_id)
    rules_count_result = await db.execute(rules_count_query)
    rules_count = rules_count_result.scalar()
    if rules_count > MAX_STANDARD_TERM_RULES:
        raise HTTPException(status_code=400, detail="each standard term may have a maximum of 10 rules")

    try:
        rule = DBStandardTermRule(standard_term_id=term_id, **request.model_dump())
        db.add(rule)
        await db.commit()
        await db.refresh(rule)
        return StandardTermRule.model_validate(rule)
    except Exception as e:
        await db.rollback()
        logger.error("failed to create standard term rule", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/standard_terms/{term_id}/rules", response_model=list[StandardTermRule], tags=["standard_term_rules"])
async def get_standard_term_rules(term_id: UUID, db: AsyncSession = Depends(get_db)) -> list[StandardTermRule]:
    """fetch all rules for a specific standard term"""

    # verify the standard term exists
    term_query = select(DBStandardTerm).where(DBStandardTerm.id == term_id)
    term_result = await db.execute(term_query)
    standard_term = term_result.scalar_one_or_none()
    if not standard_term:
        raise HTTPException(status_code=404, detail="standard term not found")

    try:
        query = select(DBStandardTermRule).where(DBStandardTermRule.standard_term_id == term_id)
        result = await db.execute(query)
        rules = result.scalars().all()
        return [StandardTermRule.model_validate(rule) for rule in rules]
    except Exception as e:
        logger.error("failed to fetch standard term rules", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/standard_terms/{term_id}/rules/{rule_id}", response_model=StandardTermRule, tags=["standard_term_rules"])
async def get_standard_term_rule(term_id: UUID, rule_id: UUID, db: AsyncSession = Depends(get_db)) -> StandardTermRule:
    """fetch a specific rule for a standard term"""

    try:
        query = select(DBStandardTermRule).where(DBStandardTermRule.id == rule_id, DBStandardTermRule.standard_term_id == term_id)
        result = await db.execute(query)
        rule = result.scalar_one_or_none()
        if not rule:
            raise HTTPException(status_code=404, detail="rule not found")
        return StandardTermRule.model_validate(rule)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("failed to fetch standard term rule", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/standard_terms/{term_id}/rules/{rule_id}", response_model=StandardTermRule, tags=["standard_term_rules"])
async def update_standard_term_rule(term_id: UUID, rule_id: UUID, request: StandardTermRuleUpdate, db: AsyncSession = Depends(get_db)) -> StandardTermRule:
    """update a specific rule for a standard term"""

    try:
        query = select(DBStandardTermRule).where(DBStandardTermRule.id == rule_id, DBStandardTermRule.standard_term_id == term_id)
        result = await db.execute(query)
        rule = result.scalar_one_or_none()
        if not rule:
            raise HTTPException(status_code=404, detail="rule not found")
        update_data = request.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(rule, field, value)
        await db.commit()
        await db.refresh(rule)
        return StandardTermRule.model_validate(rule)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error("failed to update standard term rule", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/standard_terms/{term_id}/rules/{rule_id}", tags=["standard_term_rules"])
async def delete_standard_term_rule(term_id: UUID, rule_id: UUID, db: AsyncSession = Depends(get_db)) -> Response:
    """delete a specific rule for a standard term"""

    try:
        query = select(DBStandardTermRule).where(DBStandardTermRule.id == rule_id, DBStandardTermRule.standard_term_id == term_id)
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
        logger.error("failed to delete standard term rule", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
