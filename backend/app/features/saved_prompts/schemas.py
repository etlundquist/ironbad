from uuid import UUID
from datetime import datetime
from typing import Optional

from app.common.schemas import ConfiguredBaseModel


class SavedPrompt(ConfiguredBaseModel):
    id: UUID
    name: str
    text: str
    variables: list[str]
    created_at: datetime
    updated_at: datetime


class SavedPromptCreate(ConfiguredBaseModel):
    name: str
    text: str
    variables: list[str]


class SavedPromptUpdate(ConfiguredBaseModel):
    name: Optional[str] = None
    text: Optional[str] = None
    variables: Optional[list[str]] = None
