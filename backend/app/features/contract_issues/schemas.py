from uuid import UUID
from datetime import datetime
from typing import Optional

from app.common.schemas import ConfiguredBaseModel
from app.features.standard_clauses.schemas import StandardClauseFlat
from app.features.standard_clause_rules.schemas import StandardClauseRule
from app.enums import IssueStatus, IssueResolution
from app.features.contract_chat.schemas import ContractSectionCitation


class ContractIssue(ConfiguredBaseModel):
    id: UUID
    standard_clause_id: UUID
    standard_clause_rule_id: UUID
    standard_clause: Optional[StandardClauseFlat] = None
    standard_clause_rule: Optional[StandardClauseRule] = None
    contract_id: UUID
    relevant_text: str
    explanation: str
    citations: Optional[list[ContractSectionCitation]] = None
    status: IssueStatus
    resolution: Optional[IssueResolution] = None
    ai_suggested_revision: Optional[str] = None
    user_suggested_revision: Optional[str] = None
    active_suggested_revision: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class ContractIssueUserRevision(ConfiguredBaseModel):
    user_suggested_revision: str

