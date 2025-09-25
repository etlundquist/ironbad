from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import datetime

from app.enums import ContractSectionType, JobStatus, ContractStatus, FileType, RuleSeverity


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


class StandardTerm(ConfiguredBaseModel):
    id: UUID
    name: str
    display_name: str
    description: str
    standard_text: str
    embedding: Optional[list[float]] = None
    created_at: datetime
    updated_at: datetime

class StandardTermCreate(ConfiguredBaseModel):
    name: str
    display_name: str
    description: str
    standard_text: str

class StandardTermUpdate(ConfiguredBaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    standard_text: Optional[str] = None


class StandardTermRule(ConfiguredBaseModel):
    id: UUID
    standard_term_id: UUID
    severity: RuleSeverity
    title: str
    text: str
    created_at: datetime
    updated_at: datetime

class StandardTermRuleCreate(ConfiguredBaseModel):
    severity: RuleSeverity
    title: str
    text: str

class StandardTermRuleUpdate(ConfiguredBaseModel):
    severity: Optional[RuleSeverity] = None
    title: Optional[str] = None
    text: Optional[str] = None


class SectionRelevanceEvaluation(ConfiguredBaseModel):
    match: bool
    confidence: int
