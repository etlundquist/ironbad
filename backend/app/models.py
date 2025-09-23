from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import datetime

from app.enums import ContractSectionType, JobStatus, ContractStatus, FileType


class ConfiguredBaseModel(BaseModel):
    class Config:
        from_attributes = True
        arbitrary_types_allowed = True


class ParsedContractSection(ConfiguredBaseModel):
    type: ContractSectionType
    level: int
    number: str
    name: Optional[str] = None
    markdown: str
    embedding: Optional[list[float]] = None
    beg_page: Optional[int] = None
    end_page: Optional[int] = None


class ParsedContract(ConfiguredBaseModel):
    filename: str
    markdown: str
    sections: list[ParsedContractSection]


class Contract(ConfiguredBaseModel):
    id: UUID
    status: ContractStatus
    filename: str
    filetype: FileType
    meta: Optional[dict] = None
    errors: Optional[list[dict]] = None
    created_at: datetime
    updated_at: datetime


class ContractIngestionJob(ConfiguredBaseModel):
    contract_id: UUID
    status: JobStatus
    errors: Optional[list[dict]] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
