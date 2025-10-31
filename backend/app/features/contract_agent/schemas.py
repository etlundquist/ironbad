from uuid import UUID
from typing import Annotated, Literal, Optional, TypeAlias, Union
from datetime import datetime

from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.schemas import ConfiguredBaseModel, ContractSectionCitation
from app.features.contract_annotations.schemas import AnnotatedContract
from app.enums import AnnotationType, ContractSectionType, ChatMessageStatus, ChatMessageRole

# agent tool request/response schemas
# -----------------------------------

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

class AgentContractSectionTextSpan(ConfiguredBaseModel):    
    section_number: str
    text_span: str

class AgentPrecedentDocument(ConfiguredBaseModel):
    name: str
    summary: str
    top_level_sections: list[AgentContractSectionPreview]


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
    status: Literal["success", "failure"]
    section_number: str
    anchor_text: str
    comment_text: str

class AgentRevisionAnnotationResponse(ConfiguredBaseModel):
    status: Literal["success", "failure"]
    section_number: str
    old_text: str
    new_text: str

class AgentAddSectionResponse(ConfiguredBaseModel):
    status: Literal["success", "failure"]
    section: Optional[AgentContractSection] = None

class AgentRemoveSectionResponse(ConfiguredBaseModel):
    status: Literal["success", "failure"]

class AgentDeleteAnnotationsResponse(ConfiguredBaseModel):
    status: Literal["success", "failure"]
    deleted_annotation_ids: list[str]
    not_found_annotation_ids: list[str]


class AgentStandardClauseRule(ConfiguredBaseModel):
    severity: str
    text: str

class AgentStandardClausePreview(ConfiguredBaseModel):
    id: str
    name: str
    description: str

class AgentStandardClause(ConfiguredBaseModel):
    id: str
    name: str
    description: str
    standard_text: str
    rules: list[AgentStandardClauseRule]

# agent chat thread/message schemas
# ---------------------------------

class ResponseCitationsAttachment(ConfiguredBaseModel):
    kind: Literal["response_citations"] = "response_citations"
    citations: list[ContractSectionCitation]

class PinnedSectionAttachment(ConfiguredBaseModel):
    kind: Literal["pinned_section"] = "pinned_section"
    section_number: str

class PinnedSectionTextAttachment(ConfiguredBaseModel):
    kind: Literal["pinned_section_text"] = "pinned_section_text"
    section_number: str
    text_span: str

class PinnedPrecedentDocumentAttachment(ConfiguredBaseModel):
    kind: Literal["pinned_precedent_document"] = "pinned_precedent_document"
    contract_id: UUID

ChatMessageAttachment: TypeAlias = Annotated[Union[
    ResponseCitationsAttachment, 
    PinnedSectionAttachment, 
    PinnedSectionTextAttachment, 
    PinnedPrecedentDocumentAttachment
], Field(discriminator="kind")]

class AgentChatMessage(ConfiguredBaseModel):
    id: UUID
    chat_thread_id: UUID
    parent_chat_message_id: Optional[UUID] = None
    status: ChatMessageStatus
    role: ChatMessageRole
    content: str
    attachments: Optional[list[ChatMessageAttachment]] = None
    created_at: datetime
    updated_at: datetime

class AgentChatThread(ConfiguredBaseModel):
    id: UUID
    contract_id: UUID
    openai_conversation_id: str
    created_at: datetime
    updated_at: datetime

class AgentRunRequest(ConfiguredBaseModel):
    contract_id: UUID
    content: str
    chat_thread_id: Optional[UUID] = None
    attachments: Optional[list[ChatMessageAttachment]] = None

# agent run event stream schemas
# ------------------------------

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


class AgentTodoItem(ConfiguredBaseModel):
    id: str
    content: str
    status: Literal["pending", "in_progress", "completed", "cancelled"]

class AgentTodoListUpdateEvent(ConfiguredBaseModel):
    event: Literal["todo_list_update"] = "todo_list_update"
    chat_thread_id: UUID
    chat_message_id: UUID
    todos: list[AgentTodoItem]

# agent runtime context and event stream context schemas
# ------------------------------------------------------

class AgentContext(ConfiguredBaseModel):
    db: AsyncSession
    contract: AnnotatedContract
    request: AgentRunRequest
    todos: list[AgentTodoItem] = []

class AgentEventStreamContext(ConfiguredBaseModel):
    db: AsyncSession
    contract: AnnotatedContract
    chat_thread_id: UUID
    user_message_id: UUID
    assistant_message_id: UUID
