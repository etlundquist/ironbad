import { ContractSectionCitation } from './contract'

export type ChatMessageStatus = 'pending' | 'in_progress' | 'completed' | 'failed'
export type ChatMessageRole = 'system' | 'user' | 'assistant'

export interface ChatThread {
  id: string
  contract_id: string
  archived: boolean
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  chat_thread_id: string
  parent_chat_message_id?: string | null
  status: ChatMessageStatus
  role: ChatMessageRole
  content: string
  citations?: ContractSectionCitation[]
  created_at: string
  updated_at: string
}

export interface ChatMessageStatusUpdate {
  chat_thread_id: string
  chat_message_id: string
  status: ChatMessageStatus
}

export interface ChatMessageTokenDelta {
  chat_message_id: string
  delta: string
}

