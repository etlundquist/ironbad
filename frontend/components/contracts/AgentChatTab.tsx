import React, { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Contract, ContractSectionCitation } from '../../lib/types'
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
  navigateToSection?: (sectionId: string) => void
  onRunCompleted?: () => void
  onClose?: () => void
}

export const AgentChatTab: React.FC<AgentChatTabProps> = ({ contract, contractId, isAnalyzing, onIngest, navigateToPage, navigateToSection, onRunCompleted, onClose }) => {
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
    },
    onRunCompleted: onRunCompleted
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

  const renderAssistantContent = (content: string, citations?: ContractSectionCitation[]) => {
    if (!content) return <span>{content}</span>

    const MarkdownWithCitations: React.FC<{ children: string }> = ({ children }) => {
      const contentRef = useRef<HTMLDivElement>(null)

      useEffect(() => {
        if (!contentRef.current || !citations) return

        const walker = document.createTreeWalker(contentRef.current, NodeFilter.SHOW_TEXT, null)

        type Replacement = { text?: string; citation?: ContractSectionCitation; sectionNum?: string }
        const nodesToReplace: Array<{ node: Text; replacements: Replacement[] }> = []

        let node: Text | null
        while ((node = walker.nextNode() as Text | null)) {
          if (!node.textContent) continue
          const text = node.textContent
          const regex = /\[([0-9]+(?:\.[0-9]+)*(?:\s*,\s*[0-9]+(?:\.[0-9]+)*)*)\]/g
          let match: RegExpExecArray | null
          let lastIndex = 0
          const replacements: Replacement[] = []
          let hasCitations = false

          while ((match = regex.exec(text)) !== null) {
            hasCitations = true
            if (match.index > lastIndex) {
              replacements.push({ text: text.slice(lastIndex, match.index) })
            }
            const group = match[1]
            const sectionNums = group.split(',').map(s => s.trim()).filter(Boolean)
            if (sectionNums.length > 0) {
              sectionNums.forEach((sectionNum) => {
                const citation = citations.find((c) => c.section_number === sectionNum)
                if (citation && citation.section_id) {
                  replacements.push({ citation, sectionNum })
                } else {
                  replacements.push({ text: `[${sectionNum}]` })
                }
              })
            } else {
              replacements.push({ text: match[0] })
            }
            lastIndex = regex.lastIndex
          }

          if (hasCitations) {
            if (lastIndex < text.length) {
              replacements.push({ text: text.slice(lastIndex) })
            }
            nodesToReplace.push({ node, replacements })
          }
        }

        nodesToReplace.forEach(({ node, replacements }) => {
          const span = document.createElement('span')
          replacements.forEach((replacement) => {
            if (replacement.text !== undefined) {
              span.appendChild(document.createTextNode(replacement.text))
            } else if (replacement.citation && replacement.sectionNum) {
              const button = document.createElement('button')
              button.type = 'button'
              button.className = 'section-number link inline'
              button.textContent = `[${replacement.sectionNum}]`
              button.title = replacement.citation.section_name || `Section ${replacement.sectionNum}`
              button.onclick = () => {
                if (navigateToSection && replacement.citation!.section_id) {
                  navigateToSection(replacement.citation!.section_id)
                }
              }
              span.appendChild(button)
            }
          })
          node.parentNode?.replaceChild(span, node)
        })
      }, [children, citations])

      return (
        <div ref={contentRef}>
          <ReactMarkdown>{children}</ReactMarkdown>
        </div>
      )
    }

    return <MarkdownWithCitations>{content}</MarkdownWithCitations>
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

  const AIIcon = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      <text x="12" y="15.5" fontSize="10" fontWeight="700" textAnchor="middle" fill="currentColor">AI</text>
      <path d="M19 4L19.5 5.5L21 6L19.5 6.5L19 8L18.5 6.5L17 6L18.5 5.5L19 4Z" fill="currentColor"/>
      <path d="M20 16L20.35 17L21.5 17.35L20.35 17.7L20 19L19.65 17.7L18.5 17.35L19.65 17L20 16Z" fill="currentColor"/>
    </svg>
  )

  return (
    <div className="tab-panel">
      <div className="tab-header agent-header">
        <div className="agent-header-title">
          <AIIcon />
          <h3>Redline Agent</h3>
        </div>
        <div className="tab-header-actions">
          {getIngestCTA()}
          {onClose && (
            <button className="close-button" onClick={onClose} title="Close Agent Chat">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
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
                        {renderAssistantContent(msg.content, msg.citations)}
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
                placeholder={contract.status === 'Uploaded' ? 'You must ingest the contract before chatting with the agent' : 'Ask the agent...'}
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