import re
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SavedPrompt as DBSavedPrompt
from app.features.saved_prompts.schemas import SavedPrompt, SavedPromptCreate, SavedPromptUpdate
from app.api.deps import get_db


router = APIRouter()
logger = logging.getLogger(__name__)


def validate_prompt_variables(text: str, variables: list[str]) -> None:
    """validate that the variables list matches the template variables in the text"""
    
    variable_pattern = r'\{\{\s*(\w+)\s*\}\}'
    detected_variables = set(re.findall(variable_pattern, text))
    provided_variables = set(variables)
    
    if detected_variables != provided_variables:
        missing_variables = detected_variables - provided_variables
        extra_variables = provided_variables - detected_variables
        error_parts = []
        if missing_variables:
            error_parts.append(f"variables in prompt text but not in variable list: {', '.join(sorted(missing_variables))}")
        if extra_variables:
            error_parts.append(f"variables in variable list but not in prompt text: {', '.join(sorted(extra_variables))}")
        raise HTTPException(status_code=400, detail=f"variable mismatch - {'; '.join(error_parts)}")


@router.post("/saved_prompts", response_model=SavedPrompt, tags=["saved_prompts"])
async def create_saved_prompt(request: SavedPromptCreate, db: AsyncSession = Depends(get_db)) -> SavedPrompt:
    """add a new saved prompt"""

    validate_prompt_variables(request.text, request.variables)
    try:
        prompt = DBSavedPrompt(**request.model_dump())
        db.add(prompt)
        await db.commit()
        await db.refresh(prompt)
        return SavedPrompt.model_validate(prompt)
    except IntegrityError:
        await db.rollback()
        logger.error("failed to create saved prompt", exc_info=True)
        raise HTTPException(status_code=409, detail="failed to create saved prompt")
    except Exception as e:
        await db.rollback()
        logger.error("failed to create saved prompt", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/saved_prompts", response_model=list[SavedPrompt], tags=["saved_prompts"])
async def get_saved_prompts(db: AsyncSession = Depends(get_db)) -> list[SavedPrompt]:
    """fetch all saved prompts"""

    try:
        query = select(DBSavedPrompt)
        result = await db.execute(query)
        prompts = result.scalars().all()
        return [SavedPrompt.model_validate(prompt) for prompt in prompts]
    except Exception as e:
        logger.error("failed to fetch saved prompts", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/saved_prompts/{prompt_id}", response_model=SavedPrompt, tags=["saved_prompts"])
async def get_saved_prompt(prompt_id: UUID, db: AsyncSession = Depends(get_db)) -> SavedPrompt:
    """fetch a single saved prompt by ID"""

    try:
        query = select(DBSavedPrompt).where(DBSavedPrompt.id == prompt_id)
        result = await db.execute(query)
        prompt = result.scalar_one_or_none()
        if not prompt:
            raise HTTPException(status_code=404, detail="saved prompt not found")
        return SavedPrompt.model_validate(prompt)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("failed to fetch saved prompt", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/saved_prompts/{prompt_id}", response_model=SavedPrompt, tags=["saved_prompts"])
async def update_saved_prompt(prompt_id: UUID, request: SavedPromptUpdate, db: AsyncSession = Depends(get_db)) -> SavedPrompt:
    """update a specific saved prompt by ID"""

    try:
        query = select(DBSavedPrompt).where(DBSavedPrompt.id == prompt_id)
        result = await db.execute(query)
        prompt = result.scalar_one_or_none()
        if not prompt:
            raise HTTPException(status_code=404, detail="saved prompt not found")
        update_data = request.model_dump(exclude_unset=True)
        
        # determine the final text and variables after update
        final_text = update_data.get('text', prompt.text)
        final_variables = update_data.get('variables', prompt.variables)
        
        # validate if either text or variables are being updated
        if 'text' in update_data or 'variables' in update_data:
            validate_prompt_variables(final_text, final_variables)
        
        # update the prompt with the new data
        for field, value in update_data.items():
            setattr(prompt, field, value)

        await db.commit()
        await db.refresh(prompt)
        return SavedPrompt.model_validate(prompt)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error("failed to update saved prompt", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/saved_prompts/{prompt_id}", tags=["saved_prompts"])
async def delete_saved_prompt(prompt_id: UUID, db: AsyncSession = Depends(get_db)) -> Response:
    """delete a specific saved prompt by ID"""

    try:
        query = select(DBSavedPrompt).where(DBSavedPrompt.id == prompt_id)
        result = await db.execute(query)
        prompt = result.scalar_one_or_none()
        if not prompt:
            raise HTTPException(status_code=404, detail="saved prompt not found")
        await db.delete(prompt)
        await db.commit()
        return Response(status_code=204)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error("failed to delete saved prompt", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

