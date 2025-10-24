from uuid import UUID
from datetime import datetime
from typing import Optional

from app.common.schemas import ConfiguredBaseModel
from app.enums import RuleSeverity


class StandardClauseRule(ConfiguredBaseModel):
    id: UUID
    standard_clause_id: UUID
    severity: RuleSeverity
    title: str
    text: str
    created_at: datetime
    updated_at: datetime

class StandardClauseRuleCreate(ConfiguredBaseModel):
    severity: RuleSeverity
    title: str
    text: str

class StandardClauseRuleUpdate(ConfiguredBaseModel):
    severity: Optional[RuleSeverity] = None
    title: Optional[str] = None
    text: Optional[str] = None


