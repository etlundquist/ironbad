from uuid import UUID
from datetime import datetime
from typing import Optional

from app.common.schemas import ConfiguredBaseModel
from app.features.standard_clauses.schemas import StandardClauseFlat

class ContractClause(ConfiguredBaseModel):
    id: UUID
    standard_clause_id: UUID
    standard_clause: Optional[StandardClauseFlat] = None
    contract_id: UUID
    contract_sections: list[UUID]
    raw_markdown: str
    cleaned_markdown: str
    created_at: datetime
    updated_at: datetime
