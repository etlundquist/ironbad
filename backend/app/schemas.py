from pydantic import BaseModel, Field
from typing import Literal, Optional
from uuid import UUID
from datetime import datetime

from app.enums import ContractSectionType, JobStatus, ContractStatus, FileType, RuleSeverity


class ConfiguredBaseModel(BaseModel):
    class Config:
        from_attributes = True
        arbitrary_types_allowed = True


class ContractMetadata(ConfiguredBaseModel):
    document_type: Literal["Master Agreement", "Statement of Work", "Purchase Order", "Other"]
    document_title: Optional[str] = None
    customer_name: Optional[str] = None
    supplier_name: Optional[str] = None
    effective_date: Optional[str] = None
    initial_term: Optional[str] = None

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
    metadata: ContractMetadata
    sections: list[ParsedContractSection]


class Contract(ConfiguredBaseModel):
    id: UUID
    status: ContractStatus
    filename: str
    filetype: FileType
    meta: Optional[ContractMetadata] = None
    errors: Optional[list[dict]] = None
    created_at: datetime
    updated_at: datetime


class ContractIngestionJob(ConfiguredBaseModel):
    contract_id: UUID
    status: JobStatus
    errors: Optional[list[dict]] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class StandardClause(ConfiguredBaseModel):
    id: UUID
    name: str
    display_name: str
    description: str
    standard_text: str
    embedding: Optional[list[float]] = None
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


class ContractClause(ConfiguredBaseModel):
    id: UUID
    standard_clause_id: UUID
    contract_id: UUID
    contract_sections: list[UUID]
    raw_markdown: str
    cleaned_markdown: str
    created_at: datetime
    updated_at: datetime


class SectionRelevanceEvaluation(ConfiguredBaseModel):
    match: bool
    confidence: int
