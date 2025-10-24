from uuid import UUID
from datetime import datetime
from typing import Optional

from pydantic import Field
from app.common.schemas import ConfiguredBaseModel
from app.features.standard_clause_rules.schemas import StandardClauseRule


class StandardClause(ConfiguredBaseModel):
    id: UUID
    name: str
    display_name: str
    description: str
    standard_text: str
    embedding: Optional[list[float]] = Field(default=None, exclude=True)
    rules: Optional[list[StandardClauseRule]] = None
    created_at: datetime
    updated_at: datetime

class StandardClauseFlat(ConfiguredBaseModel):
    id: UUID
    name: str
    display_name: str
    description: str
    standard_text: str
    created_at: datetime
    updated_at: datetime

class StandardClauseCreate(ConfiguredBaseModel):
    name: str
    display_name: str
    description: str
    standard_text: str

class StandardClauseUpdate(ConfiguredBaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    standard_text: Optional[str] = None
