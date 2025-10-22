import React, { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Contract } from '../../lib/types'
import { useAgentChat } from '../../hooks/useAgentChat'
import { Spinner } from '../common/Spinner'
import { useNotificationContext } from '../common/NotificationProvider'
import { AgentProgressPanel } from './AgentProgressPanel'

interface AgentChatTabProps {
  contract: Contract
  contractId: string | undefined
  isAnalyzing: boolean
  onIngest: () => void
  navigateToPage: (page: number) => void
}

export const AgentChatTab: React.FC<AgentChatTabProps> = ({ contract, contractId, isAnalyzing, onIngest, navigateToPage }) => {
  const { showToast } = useNotificationContext()
  const [expandedProgressPanels, setExpandedProgressPanels] = useState<Set<string>>(new Set())
  const {
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
  } = useAgentChat(contractId, {
    onError: (title, message) => showToast({ type: 'error', title, message }),
    onToolCall: (toolName, toolCallId, toolCallArgs) => {
      console.log('Agent tool call:', { toolName, toolCallId, toolCallArgs })
    },
    onToolCallOutput: (toolCallId, toolCallOutput) => {
      console.log('Agent tool output:', { toolCallId, toolCallOutput })
    },
    onReasoningSummary: (reasoningId, reasoningSummary) => {
      console.log('Agent reasoning:', { reasoningId, reasoningSummary })
    }
  })

  useEffect(() => {
    fetchCurrentChatThreadAndMessages()
  }, [])

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages.length])

  const getIngestCTA = () => {
    switch (contract.status) {
      case 'Uploaded':
        return (
          <button className="cta-button primary" onClick={onIngest} disabled={isAnalyzing}>
            {isAnalyzing ? (
              <>
                <Spinner size="small" />
                Ingesting...
              </>
            ) : (
              'Ingest Contract'
            )}
          </button>
        )
      case 'Ingesting':
        return (
          <div className="cta-banner processing">
            <Spinner size="small" />
            Contract is currently being ingested
          </div>
        )
      default:
        return null
    }
  }

  const renderAssistantContent = (content: string) => {
    if (!content) return <span>{content}</span>
    return <ReactMarkdown>{content}</ReactMarkdown>
  }

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Waiting'
      case 'in_progress':
        return 'Thinking'
      case 'responding':
        return 'Responding'
      case 'completed':
        return 'Complete'
      case 'failed':
        return 'Failed'
      case 'cancelled':
        return 'Cancelled'
      default:
        return status.replace('_', ' ')
    }
  }

  const toggleProgressPanel = (messageId: string) => {
    setExpandedProgressPanels(prev => {
      const newSet = new Set(prev)
      if (newSet.has(messageId)) {
        newSet.delete(messageId)
      } else {
        newSet.add(messageId)
      }
      return newSet
    })
  }

  return (
    <div className="tab-panel">
      <div className="tab-header">
        <h3>Review and Redline Assistant</h3>
        <div className="tab-header-actions">
          {getIngestCTA()}
        </div>
      </div>

      <div className="chat-container">
        {isChatLoading ? (
          <div className="issues-loading">
            <Spinner size="large" />
            <p>Loading agent chat...</p>
          </div>
        ) : (
          <>
            <div className="chat-messages">
              {chatMessages.length === 0 && (
                <div className="empty-state">
                  <p>No messages yet. Ask the agent to help with contract analysis, redlining, or questions.</p>
                </div>
              )}
              {chatMessages.map((msg) => (
                <div key={msg.id} className={`chat-message ${msg.role}`}>
                  <div className="chat-message-meta">
                    <span className="role">{msg.role === 'user' ? 'You' : 'Agent'}</span>
                    <span className={`status ${msg.status.replace('_', '-')}`}>
                      {getStatusDisplay(msg.status)}
                    </span>
                  </div>
                  <div className="chat-message-content">
                    {msg.role === 'assistant' ? (
                      <div className="assistant-content">
                        {renderAssistantContent(msg.content)}
                        {(msg.status === 'in_progress' || msg.status === 'responding') && (
                          <span className="typing-indicator">●</span>
                        )}
                        <AgentProgressPanel
                          message={msg}
                          progressSteps={messageProgress.get(msg.id) || []}
                          isExpanded={expandedProgressPanels.has(msg.id)}
                          setExpanded={(expanded: boolean) => {
                            setExpandedProgressPanels(prev => {
                              const newSet = new Set(prev)
                              if (expanded) newSet.add(msg.id); else newSet.delete(msg.id)
                              return newSet
                            })
                          }}
                        />
                      </div>
                    ) : (
                      <div className="user-content">{msg.content}</div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="chat-input-container">
              <input
                type="text"
                className="form-input"
                placeholder={contract.status === 'Uploaded' ? 'Ingest the contract before chatting with the agent' : 'Ask the agent to analyze, redline, or help with the contract...'}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                disabled={isSendingMessage || contract.status === 'Uploaded' || contract.status === 'Ingesting'}
              />
              <button
                className="cta-button primary"
                onClick={sendMessage}
                disabled={isSendingMessage || !chatInput.trim() || contract.status === 'Uploaded' || contract.status === 'Ingesting'}
              >
                {isSendingMessage ? (
                  <>
                    <Spinner size="small" />
                    Sending...
                  </>
                ) : (
                  'Send'
                )}
              </button>
              <button
                className="cta-button secondary"
                onClick={handleNewChat}
                disabled={isSendingMessage}
              >
                New Chat
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}