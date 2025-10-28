import { ContractSectionCitation } from './contract'

export type AgentChatMessageStatus = 'pending' | 'in_progress' | 'responding' | 'completed' | 'failed' | 'cancelled'
export type AgentChatMessageRole = 'system' | 'user' | 'assistant'

export interface PinnedSectionAttachment {
  kind: 'pinned_section'
  section_number: string
}

export interface PinnedSectionTextAttachment {
  kind: 'pinned_section_text'
  section_number: string
  text_span: string
}

export interface PinnedPrecedentDocumentAttachment {
  kind: 'pinned_precedent_document'
  contract_id: string
}

export interface ResponseCitationsAttachment {
  kind: 'response_citations'
  citations: ContractSectionCitation[]
}

export type ChatMessageAttachment = PinnedSectionAttachment | PinnedSectionTextAttachment | PinnedPrecedentDocumentAttachment | ResponseCitationsAttachment

export interface AgentChatThread {
  id: string
  contract_id: string
  openai_conversation_id: string
  created_at: string
  updated_at: string
}

export interface AgentChatMessage {
  id: string
  chat_thread_id: string
  parent_chat_message_id?: string | null
  status: AgentChatMessageStatus
  role: AgentChatMessageRole
  content: string
  attachments?: ChatMessageAttachment[]
  created_at: string
  updated_at: string
}

// Agent Run Events
export interface AgentRunCreatedEvent {
  event: 'run_created'
  chat_thread: AgentChatThread
  user_message: AgentChatMessage
  assistant_message: AgentChatMessage
}

export interface AgentRunCompletedEvent {
  event: 'run_completed'
  assistant_message: AgentChatMessage
}

export interface AgentRunFailedEvent {
  event: 'run_failed'
  assistant_message: AgentChatMessage
}

export interface AgentRunCancelledEvent {
  event: 'run_cancelled'
  assistant_message: AgentChatMessage
}

export interface AgentRunMessageStatusUpdateEvent {
  event: 'message_status_update'
  chat_thread_id: string
  chat_message_id: string
  status: AgentChatMessageStatus
}

export interface AgentRunMessageTokenDeltaEvent {
  event: 'message_token_delta'
  chat_thread_id: string
  chat_message_id: string
  delta: string
}

export interface AgentToolCallEvent {
  event: 'tool_call'
  chat_thread_id: string
  chat_message_id: string
  tool_name: string
  tool_call_id: string
  tool_call_args: Record<string, any>
}

export interface AgentToolCallOutputEvent {
  event: 'tool_call_output'
  chat_thread_id: string
  chat_message_id: string
  tool_call_id: string
  tool_call_output: string
}

export interface AgentReasoningSummaryEvent {
  event: 'reasoning_summary'
  chat_thread_id: string
  chat_message_id: string
  reasoning_id: string
  reasoning_summary: string
}

export type AgentRunEvent = 
  | AgentRunCreatedEvent
  | AgentRunCompletedEvent
  | AgentRunFailedEvent
  | AgentRunCancelledEvent
  | AgentRunMessageStatusUpdateEvent
  | AgentRunMessageTokenDeltaEvent
  | AgentToolCallEvent
  | AgentToolCallOutputEvent
  | AgentReasoningSummaryEvent
