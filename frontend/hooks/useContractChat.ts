import { useState, useRef, useEffect } from 'react'
import { ChatThread, ChatMessage, ChatMessageStatusUpdate, ChatMessageTokenDelta } from '../lib/types'
import { fetchCurrentChatThread, fetchChatMessages, archiveChatThread, sendChatMessage } from '../lib/api'

interface UseContractChatOptions {
  onError?: (title: string, message: string) => void
}

export function useContractChat(contractId: string | undefined, contract: any, options?: UseContractChatOptions) {
  const [currentChatThread, setCurrentChatThread] = useState<ChatThread | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const chatAbortControllerRef = useRef<AbortController | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const sortMessagesByTime = (messages: ChatMessage[]) => {
    return [...messages].sort((a, b) => {
      const ta = new Date(a.created_at).getTime()
      const tb = new Date(b.created_at).getTime()
      if (ta !== tb) return ta - tb
      if (a.role !== b.role) return a.role === 'user' ? -1 : 1
      return a.id.localeCompare(b.id)
    })
  }

  const fetchCurrentChatThreadAndMessages = async () => {
    if (!contractId || Array.isArray(contractId)) return

    try {
      setIsChatLoading(true)
      const thread = await fetchCurrentChatThread(contractId)

      if (thread) {
        setCurrentChatThread(thread)
        const msgs = await fetchChatMessages(contractId, thread.id)
        setChatMessages(sortMessagesByTime(msgs))
      } else {
        setCurrentChatThread(null)
        setChatMessages([])
      }
    } catch (e) {
      setCurrentChatThread(null)
      setChatMessages([])
    } finally {
      setIsChatLoading(false)
    }
  }

  const handleSSEEvent = (eventName: string, data: any) => {
    if (eventName === 'init') {
      const threadId: string = data.chat_thread_id
      const userMsg: ChatMessage = data.user_message
      const assistantMsg: ChatMessage = data.assistant_message
      setCurrentChatThread({ id: threadId, contract_id: contract!.id, archived: false, created_at: userMsg.created_at, updated_at: userMsg.updated_at })
      setChatMessages((prev) => sortMessagesByTime([
        ...prev,
        ...(prev.some((m) => m.id === userMsg.id) ? [] : [userMsg]),
        ...(prev.some((m) => m.id === assistantMsg.id) ? [] : [assistantMsg])
      ]))
    } else if (eventName === 'user_message') {
      const msg: ChatMessage = data
      setCurrentChatThread((prev) => prev || { id: msg.chat_thread_id, contract_id: contract!.id, archived: false, created_at: msg.created_at, updated_at: msg.updated_at })
      setChatMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : sortMessagesByTime([...prev, msg])))
    } else if (eventName === 'message_status_update') {
      const update: ChatMessageStatusUpdate = data
      setChatMessages((prev) => sortMessagesByTime(prev.map((m) => (m.id === update.chat_message_id ? { ...m, status: update.status } : m))))
    } else if (eventName === 'message_token_delta') {
      const delta: ChatMessageTokenDelta = data
      setChatMessages((prev) => sortMessagesByTime(prev.map((m) => (m.id === delta.chat_message_id ? { ...m, content: (m.content || '') + delta.delta, status: m.status === 'pending' ? 'in_progress' : m.status } : m))))
    } else if (eventName === 'assistant_message') {
      const fullMsg: ChatMessage = data
      setChatMessages((prev) => sortMessagesByTime(prev.map((m) => (m.id === fullMsg.id ? fullMsg : m))))
    }
  }

  const parseAndHandleSSEStream = async (response: Response) => {
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No reader available')

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { value, done } = await reader.read()

        if (done) {
          if (buffer.trim()) {
            let sepIndex
            while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
              const rawEvent = buffer.slice(0, sepIndex)
              buffer = buffer.slice(sepIndex + 2)
              const lines = rawEvent.split('\n')
              let eventName = ''
              let dataStr = ''
              for (const line of lines) {
                if (line.startsWith('event:')) eventName = line.slice(6).trim()
                if (line.startsWith('data:')) dataStr += line.slice(5).trim()
              }
              if (eventName && dataStr) {
                try {
                  const parsed = JSON.parse(dataStr)
                  handleSSEEvent(eventName, parsed)
                } catch (e) {
                  console.error('Error parsing SSE data:', e)
                }
              }
            }
          }
          break
        }

        if (!value || value.length === 0) continue

        let chunk = decoder.decode(value, { stream: true })
        chunk = chunk.replace(/\r\n/g, '\n')
        buffer += chunk

        let sepIndex
        while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, sepIndex)
          buffer = buffer.slice(sepIndex + 2)
          const lines = rawEvent.split('\n')
          let eventName = ''
          let dataStr = ''
          for (const line of lines) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim()
            if (line.startsWith('data:')) dataStr += line.slice(5).trim()
          }
          if (eventName && dataStr) {
            try {
              const parsed = JSON.parse(dataStr)
              handleSSEEvent(eventName, parsed)
            } catch (e) {
              console.error('Error parsing SSE data:', e)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in SSE stream parsing:', error)
      throw error
    }
  }

  const sendMessage = async () => {
    if (!contract || !chatInput.trim() || isSendingMessage || !contractId || Array.isArray(contractId)) return

    const controller = new AbortController()
    chatAbortControllerRef.current = controller
    setIsSendingMessage(true)

    const userMessageContent = chatInput.trim()
    setChatInput('')

    try {
      const resp = await sendChatMessage(contractId, userMessageContent, currentChatThread?.id, controller.signal)
      if (!resp.body) throw new Error('No response body')
      await parseAndHandleSSEStream(resp)
    } catch (e) {
      if ((e as any)?.name !== 'AbortError') {
        options?.onError?.('Chat Request Failed', 'Failed to send chat message. Please try again.')
      }
    } finally {
      setIsSendingMessage(false)
      if (chatAbortControllerRef.current === controller) chatAbortControllerRef.current = null
    }
  }

  const handleNewChat = async () => {
    if (chatAbortControllerRef.current) {
      chatAbortControllerRef.current.abort()
      chatAbortControllerRef.current = null
    }

    if (currentChatThread && contractId && !Array.isArray(contractId)) {
      try {
        await archiveChatThread(contractId, currentChatThread.id)
      } catch (_) {}
    }

    setCurrentChatThread(null)
    setChatMessages([])
  }

  return {
    currentChatThread,
    chatMessages,
    isChatLoading,
    isSendingMessage,
    chatInput,
    chatEndRef,
    setChatInput,
    fetchCurrentChatThreadAndMessages,
    sendMessage,
    handleNewChat
  }
}

