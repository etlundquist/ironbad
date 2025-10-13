import { ChatThread, ChatMessage } from '../types'

const getBackendUrl = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

export async function fetchCurrentChatThread(contractId: string): Promise<ChatThread | null> {
  const response = await fetch(`${getBackendUrl()}/contracts/${contractId}/chat/threads/current`)
  if (!response.ok) return null
  return response.json()
}

export async function fetchChatMessages(contractId: string, threadId: string): Promise<ChatMessage[]> {
  const response = await fetch(`${getBackendUrl()}/contracts/${contractId}/chat/threads/${threadId}/messages`)
  if (!response.ok) throw new Error('Failed to fetch chat messages')
  return response.json()
}

export async function archiveChatThread(contractId: string, threadId: string): Promise<void> {
  await fetch(`${getBackendUrl()}/contracts/${contractId}/chat/threads/${threadId}`, {
    method: 'PUT'
  })
}

export async function sendChatMessage(contractId: string, content: string, chatThreadId?: string, signal?: AbortSignal): Promise<Response> {
  const payload: any = { content }
  if (chatThreadId) payload.chat_thread_id = chatThreadId

  const response = await fetch(`${getBackendUrl()}/contracts/${contractId}/chat/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  })

  if (!response.ok) throw new Error('Failed to send chat message')
  return response
}

