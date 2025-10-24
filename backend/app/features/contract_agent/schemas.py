from uuid import UUID
from typing import Literal, Optional
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.schemas import ConfiguredBaseModel
from app.features.contract_annotations.schemas import AnnotatedContract
from app.enums import AnnotationType, ContractSectionType, ChatMessageStatus, ChatMessageRole


class AgentContext(ConfiguredBaseModel):
    db: AsyncSession
    contract: AnnotatedContract

class AgentContractSectionPreview(ConfiguredBaseModel):
    type: ContractSectionType
    level: int
    section_number: str
    section_text_preview: str

class AgentContractSection(ConfiguredBaseModel):
    type: ContractSectionType
    level: int
    section_number: str
    section_text: str

class AgentContractTextMatch(ConfiguredBaseModel):
    section_number: str
    match_line: str


class AgentCommentAnnotation(ConfiguredBaseModel):
    id: UUID
    annotation_type: str = AnnotationType.COMMENT.value
    section_number: str
    anchor_text: str
    comment_text: str

class AgentRevisionAnnotation(ConfiguredBaseModel):
    id: UUID
    annotation_type: str = AnnotationType.REVISION.value
    section_number: str
    old_text: str
    new_text: str

class AgentSectionAddAnnotation(ConfiguredBaseModel):
    id: UUID
    annotation_type: str = AnnotationType.SECTION_ADD.value
    target_parent_section_number: str
    insertion_index: int
    section_number: str
    section_type: ContractSectionType
    section_text: str

class AgentSectionRemoveAnnotation(ConfiguredBaseModel):
    id: UUID
    annotation_type: str = AnnotationType.SECTION_REMOVE.value
    section_number: str


class AgentCommentAnnotationResponse(ConfiguredBaseModel):
    status: Literal["applied", "rejected", "conflict"]
    section_number: str
    anchor_text: str
    comment_text: str

class AgentRevisionAnnotationResponse(ConfiguredBaseModel):
    status: Literal["applied", "rejected", "conflict"]
    section_number: str
    old_text: str
    new_text: str

class AgentAddSectionResponse(ConfiguredBaseModel):
    status: Literal["applied", "rejected", "conflict"]
    section: Optional[AgentContractSection] = None

class AgentRemoveSectionResponse(ConfiguredBaseModel):
    status: Literal["applied", "rejected", "conflict"]


class AgentRunRequest(ConfiguredBaseModel):
    contract_id: UUID
    chat_thread_id: Optional[UUID] = None
    content: str

class AgentRunEventStreamContext(ConfiguredBaseModel):
    db: AsyncSession
    chat_thread_id: UUID
    user_message_id: UUID
    assistant_message_id: UUID


class AgentChatThread(ConfiguredBaseModel):
    id: UUID
    contract_id: UUID
    openai_conversation_id: str
    created_at: datetime
    updated_at: datetime

class AgentChatMessage(ConfiguredBaseModel):
    id: UUID
    chat_thread_id: UUID
    parent_chat_message_id: Optional[UUID] = None
    status: ChatMessageStatus
    role: ChatMessageRole
    content: str
    created_at: datetime
    updated_at: datetime


class AgentRunCreatedEvent(ConfiguredBaseModel):
    event: Literal["run_created"] = "run_created"
    chat_thread: AgentChatThread
    user_message: AgentChatMessage
    assistant_message: AgentChatMessage

class AgentRunCompletedEvent(ConfiguredBaseModel):
    event: Literal["run_completed"] = "run_completed"
    assistant_message: AgentChatMessage

class AgentRunFailedEvent(ConfiguredBaseModel):
    event: Literal["run_failed"] = "run_failed"
    assistant_message: AgentChatMessage

class AgentRunCancelledEvent(ConfiguredBaseModel):
    event: Literal["run_cancelled"] = "run_cancelled"
    assistant_message: AgentChatMessage

class AgentRunMessageStatusUpdateEvent(ConfiguredBaseModel):
    event: Literal["message_status_update"] = "message_status_update"
    chat_thread_id: UUID
    chat_message_id: UUID
    status: ChatMessageStatus

class AgentRunMessageTokenDeltaEvent(ConfiguredBaseModel):
    event: Literal["message_token_delta"] = "message_token_delta"
    chat_thread_id: UUID
    chat_message_id: UUID
    delta: str

class AgentToolCallEvent(ConfiguredBaseModel):
    event: Literal["tool_call"] = "tool_call"
    chat_thread_id: UUID
    chat_message_id: UUID
    tool_name: str
    tool_call_id: str 
    tool_call_args: dict
    
class AgentToolCallOutputEvent(ConfiguredBaseModel):
    event: Literal["tool_call_output"] = "tool_call_output"
    chat_thread_id: UUID
    chat_message_id: UUID
    tool_call_id: str   
    tool_call_output: str

class AgentReasoningSummaryEvent(ConfiguredBaseModel):
    event: Literal["reasoning_summary"] = "reasoning_summary"
    chat_thread_id: UUID
    chat_message_id: UUID
    reasoning_id: str
    reasoning_summary: str
