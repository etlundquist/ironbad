from pydantic import BaseModel, Field
from typing import Literal, Optional, Union
from uuid import UUID
from datetime import datetime

from app.enums import ChatMessageRole, ChatMessageStatus, ContractSectionType, IssueResolution, JobStatus, ContractStatus, FileType, RuleSeverity, IssueStatus


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
    embedding: Optional[list[float]] = Field(default=None, exclude=True)
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


class ContractAnalysisJob(ConfiguredBaseModel):
    contract_id: UUID
    status: JobStatus
    errors: Optional[list[dict]] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


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
    standard_clause: Optional[StandardClauseFlat] = None
    contract_id: UUID
    contract_sections: list[UUID]
    raw_markdown: str
    cleaned_markdown: str
    created_at: datetime
    updated_at: datetime


class SectionRelevanceEvaluation(ConfiguredBaseModel):
    match: bool
    confidence: int


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


class ContractSectionCitation(ConfiguredBaseModel):
    section_id: str
    section_number: str
    section_name: Optional[str] = None
    beg_page: Optional[int] = None
    end_page: Optional[int] = None

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


class ChatMessageCreate(ConfiguredBaseModel):
    chat_thread_id: Optional[UUID] = None
    content: str


class ChatThread(ConfiguredBaseModel):
    id: UUID
    contract_id: UUID
    archived: bool
    created_at: datetime
    updated_at: datetime


class ChatMessage(ConfiguredBaseModel):
    id: UUID
    chat_thread_id: UUID
    parent_chat_message_id: Optional[UUID] = None
    status: ChatMessageStatus
    role: ChatMessageRole
    content: str
    citations: Optional[list[ContractSectionCitation]] = None
    created_at: datetime
    updated_at: datetime


class ChatMessageStatusUpdate(ConfiguredBaseModel):
    chat_thread_id: UUID
    chat_message_id: UUID
    status: ChatMessageStatus

class ChatMessageTokenDelta(ConfiguredBaseModel):
    chat_message_id: UUID
    delta: str


class ChatInitEventData(ConfiguredBaseModel):
    chat_thread_id: UUID
    user_message: ChatMessage
    assistant_message: ChatMessage


class ChatMessageEvent(ConfiguredBaseModel):
    event: Literal["init", "user_message", "assistant_message", "message_status_update", "message_token_delta"]
    data: Union[ChatMessage, ChatMessageStatusUpdate, ChatMessageTokenDelta, ChatInitEventData]

