from uuid import UUID

from datetime import datetime
from typing import Optional, Literal, Union

from app.common.schemas import ConfiguredBaseModel
from app.enums import ChatMessageStatus, ChatMessageRole


class ChatMessageCreate(ConfiguredBaseModel):
    chat_thread_id: Optional[UUID] = None
    content: str


class ChatThread(ConfiguredBaseModel):
    id: UUID
    contract_id: UUID
    archived: bool
    created_at: datetime
    updated_at: datetime


class ContractSectionCitation(ConfiguredBaseModel):
    section_id: str
    section_number: str
    section_name: Optional[str] = None
    beg_page: Optional[int] = None
    end_page: Optional[int] = None


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
