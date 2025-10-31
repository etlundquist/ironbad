from uuid import UUID
from datetime import datetime
from typing import Optional

from pydantic import Field

from app.common.schemas import ConfiguredBaseModel, ContractMetadata, ContractSectionNode
from app.enums import ContractSectionType, JobStatus


class ContractIngestionJob(ConfiguredBaseModel):
    contract_id: UUID
    status: JobStatus
    errors: Optional[list[dict]] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

class ContractAnalysisJob(ConfiguredBaseModel):
    contract_id: UUID
    status: JobStatus
    errors: Optional[list[dict]] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

class JobStatusUpdate(ConfiguredBaseModel):
    contract_id: UUID
    status: JobStatus
    errors: Optional[list[dict]] = None
    timestamp: datetime


class SectionRelevanceEvaluation(ConfiguredBaseModel):
    relevant: bool
    confidence: int

class ParsedContractSection(ConfiguredBaseModel):
    type: ContractSectionType
    level: int
    number: str
    name: Optional[str] = None
    markdown: str
    embedding: Optional[list[float]] = Field(default=None, exclude=True)
    beg_page: Optional[int] = None
    end_page: Optional[int] = None

class ParsedContract(ConfiguredBaseModel):
    filename: str
    markdown: str
    metadata: ContractMetadata
    section_list: list[ParsedContractSection]
    section_tree: ContractSectionNode


class ClauseRuleEvaluation(ConfiguredBaseModel):
    violation: bool
    relevant_text: Optional[str] = None
    explanation: Optional[str] = None
    citations: Optional[list[str]] = None

class EvaluatedClauseRule(ConfiguredBaseModel):
    standard_clause_rule_id: UUID
    violation: bool
    relevant_text: Optional[str] = None
    explanation: Optional[str] = None
    citations: Optional[list[str]] = None
