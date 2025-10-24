from uuid import UUID
from datetime import datetime
from typing import Optional
from app.common.schemas import ConfiguredBaseModel
from app.enums import ContractSectionType


class ContractSection(ConfiguredBaseModel):
    id: UUID
    contract_id: UUID
    type: ContractSectionType
    level: int
    number: str
    name: Optional[str] = None
    markdown: str
    beg_page: int
    end_page: int
    created_at: datetime
    updated_at: datetime
