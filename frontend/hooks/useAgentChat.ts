import { useState, useRef, useEffect } from 'react'
import { 
  AgentChatThread, 
  AgentChatMessage, 
  AgentRunEvent,
  AgentRunCreatedEvent,
  AgentRunCompletedEvent,
  AgentRunFailedEvent,
  AgentRunCancelledEvent,
  AgentRunMessageStatusUpdateEvent,
  AgentRunMessageTokenDeltaEvent,
  AgentToolCallEvent,
  AgentToolCallOutputEvent,
  AgentReasoningSummaryEvent
} from '../lib/types'
import { fetchCurrentAgentThread, fetchAgentThreadMessages, runAgent } from '../lib/api'

interface UseAgentChatOptions {
  onError?: (title: string, message: string) => void
  onToolCall?: (toolName: string, toolCallId: string, toolCallArgs: Record<string, any>) => void
  onToolCallOutput?: (toolCallId: string, toolCallOutput: string) => void
  onReasoningSummary?: (reasoningId: string, reasoningSummary: string) => void
  onRunCompleted?: () => void
}

export function useAgentChat(contractId: string | undefined, options?: UseAgentChatOptions) {
  const [currentChatThread, setCurrentChatThread] = useState<AgentChatThread | null>(null)
  const [chatMessages, setChatMessages] = useState<AgentChatMessage[]>([])
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [messageProgress, setMessageProgress] = useState<Map<string, Array<{type: 'tool_call' | 'reasoning', data: any, timestamp: number}>>>(new Map())
  const chatAbortControllerRef = useRef<AbortController | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const sortMessagesByTime = (messages: AgentChatMessage[]) => {
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
      const thread = await fetchCurrentAgentThread()

      if (thread) {
        setCurrentChatThread(thread)
        const msgs = await fetchAgentThreadMessages(thread.id)
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

  const handleAgentRunEvent = (event: AgentRunEvent) => {
    switch (event.event) {
      case 'run_created':
        const createdEvent = event as AgentRunCreatedEvent
        setCurrentChatThread(createdEvent.chat_thread)
        setChatMessages((prev) => sortMessagesByTime([
          ...prev,
          ...(prev.some((m) => m.id === createdEvent.user_message.id) ? [] : [createdEvent.user_message]),
          ...(prev.some((m) => m.id === createdEvent.assistant_message.id) ? [] : [createdEvent.assistant_message])
        ]))
        // Initialize progress tracking for the new assistant message
        setMessageProgress(prev => {
          const newMap = new Map(prev)
          newMap.set(createdEvent.assistant_message.id, [])
          return newMap
        })
        break

      case 'message_status_update':
        const statusEvent = event as AgentRunMessageStatusUpdateEvent
        setChatMessages((prev) => sortMessagesByTime(prev.map((m) => 
          m.id === statusEvent.chat_message_id ? { ...m, status: statusEvent.status } : m
        )))
        break

      case 'message_token_delta':
        const deltaEvent = event as AgentRunMessageTokenDeltaEvent
        setChatMessages((prev) => sortMessagesByTime(prev.map((m) => {
          if (m.id === deltaEvent.chat_message_id) {
            // On first token delta, transition from 'in_progress' to 'responding'
            const newStatus = m.status === 'in_progress' ? 'responding' : m.status
            return { 
              ...m, 
              content: (m.content || '') + deltaEvent.delta, 
              status: newStatus
            }
          }
          return m
        })))
        break

      case 'tool_call':
        const toolCallEvent = event as AgentToolCallEvent
        setMessageProgress(prev => {
          const newMap = new Map(prev)
          const messageId = toolCallEvent.chat_message_id
          const currentProgress = newMap.get(messageId) || []
          newMap.set(messageId, [...currentProgress, {
            type: 'tool_call',
            data: toolCallEvent,
            timestamp: Date.now()
          }])
          return newMap
        })
        options?.onToolCall?.(toolCallEvent.tool_name, toolCallEvent.tool_call_id, toolCallEvent.tool_call_args)
        break

      case 'tool_call_output':
        const toolOutputEvent = event as AgentToolCallOutputEvent
        options?.onToolCallOutput?.(toolOutputEvent.tool_call_id, toolOutputEvent.tool_call_output)
        break

      case 'reasoning_summary':
        const reasoningEvent = event as AgentReasoningSummaryEvent
        setMessageProgress(prev => {
          const newMap = new Map(prev)
          const messageId = reasoningEvent.chat_message_id
          const currentProgress = newMap.get(messageId) || []
          newMap.set(messageId, [...currentProgress, {
            type: 'reasoning',
            data: reasoningEvent,
            timestamp: Date.now()
          }])
          return newMap
        })
        options?.onReasoningSummary?.(reasoningEvent.reasoning_id, reasoningEvent.reasoning_summary)
        break

      case 'run_completed':
        const completedEvent = event as AgentRunCompletedEvent
        setChatMessages((prev) => sortMessagesByTime(prev.map((m) => 
          m.id === completedEvent.assistant_message.id ? completedEvent.assistant_message : m
        )))
        options?.onRunCompleted?.()
        break

      case 'run_failed':
        const failedEvent = event as AgentRunFailedEvent
        setChatMessages((prev) => sortMessagesByTime(prev.map((m) => 
          m.id === failedEvent.assistant_message.id ? failedEvent.assistant_message : m
        )))
        break

      case 'run_cancelled':
        const cancelledEvent = event as AgentRunCancelledEvent
        setChatMessages((prev) => sortMessagesByTime(prev.map((m) => 
          m.id === cancelledEvent.assistant_message.id ? cancelledEvent.assistant_message : m
        )))
        break
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
                  handleAgentRunEvent(parsed)
                } catch (e) {
                  console.error('Error parsing agent SSE data:', e)
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
              handleAgentRunEvent(parsed)
            } catch (e) {
              console.error('Error parsing agent SSE data:', e)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in agent SSE stream parsing:', error)
      throw error
    }
  }

  const sendMessage = async (attachments?: any[]) => {
    if (!contractId || !chatInput.trim() || isSendingMessage || Array.isArray(contractId)) return

    const controller = new AbortController()
    chatAbortControllerRef.current = controller
    setIsSendingMessage(true)

    const userMessageContent = chatInput.trim()
    setChatInput('')

    try {
      const resp = await runAgent(contractId, userMessageContent, currentChatThread?.id, attachments, controller.signal)
      if (!resp.body) throw new Error('No response body')
      await parseAndHandleSSEStream(resp)
    } catch (e) {
      if ((e as any)?.name !== 'AbortError') {
        options?.onError?.('Agent Request Failed', 'Failed to run agent. Please try again.')
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
    handleNewChat,
    messageProgress
  }
}