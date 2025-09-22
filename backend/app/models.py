from pydantic import BaseModel
from uuid import UUID
from typing import Optional
from datetime import datetime

from app.enums import ContractStatus, FileType


class ConfiguredBaseModel(BaseModel):
    class Config:
        from_attributes = True
        arbitrary_types_allowed = True


class Contract(ConfiguredBaseModel):
    id: UUID
    status: ContractStatus
    filename: str
    filetype: FileType
    meta: Optional[dict] = None
    created_at: datetime
    updated_at: datetime
