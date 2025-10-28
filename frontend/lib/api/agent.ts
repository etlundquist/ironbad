import { AgentChatThread, AgentChatMessage, ChatMessageAttachment } from '../types'

const getBackendUrl = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

export async function fetchAgentThreads(): Promise<AgentChatThread[]> {
  const response = await fetch(`${getBackendUrl()}/agent/threads`)
  if (!response.ok) throw new Error('Failed to fetch agent threads')
  return response.json()
}

export async function fetchCurrentAgentThread(): Promise<AgentChatThread | null> {
  const response = await fetch(`${getBackendUrl()}/agent/threads/current`)
  if (!response.ok) return null
  return response.json()
}

export async function fetchAgentThread(threadId: string): Promise<AgentChatThread> {
  const response = await fetch(`${getBackendUrl()}/agent/threads/${threadId}`)
  if (!response.ok) throw new Error('Failed to fetch agent thread')
  return response.json()
}

export async function fetchAgentThreadMessages(threadId: string): Promise<AgentChatMessage[]> {
  const response = await fetch(`${getBackendUrl()}/agent/threads/${threadId}/messages`)
  if (!response.ok) throw new Error('Failed to fetch agent thread messages')
  return response.json()
}

export async function fetchAgentChatMessage(threadId: string, messageId: string): Promise<AgentChatMessage> {
  const response = await fetch(`${getBackendUrl()}/agent/threads/${threadId}/messages/${messageId}`)
  if (!response.ok) throw new Error('Failed to fetch agent chat message')
  return response.json()
}

export async function runAgent(contractId: string, content: string, chatThreadId?: string, attachments?: ChatMessageAttachment[], signal?: AbortSignal): Promise<Response> {
  const payload: any = { contract_id: contractId, content }
  if (chatThreadId) payload.chat_thread_id = chatThreadId
  if (attachments && attachments.length > 0) payload.attachments = attachments

  const response = await fetch(`${getBackendUrl()}/agent/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  })

  if (!response.ok) throw new Error('Failed to run agent')
  return response
}
