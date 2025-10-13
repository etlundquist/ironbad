import React, { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { Contract, ContractSectionCitation } from '../../lib/types'
import { useContractChat } from '../../hooks/useContractChat'
import { Spinner } from '../common/Spinner'
import { useNotificationContext } from '../common/NotificationProvider'

interface ChatTabProps {
  contract: Contract
  contractId: string | undefined
  isAnalyzing: boolean
  onIngest: () => void
  navigateToPage: (page: number) => void
}

export const ChatTab: React.FC<ChatTabProps> = ({ contract, contractId, isAnalyzing, onIngest, navigateToPage }) => {
  const { showToast } = useNotificationContext()
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
    handleNewChat
  } = useContractChat(contractId, contract, {
    onError: (title, message) => showToast({ type: 'error', title, message })
  })

  useEffect(() => {
    fetchCurrentChatThreadAndMessages()
  }, [])

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages.length])

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
                if (citation && (citation.beg_page !== undefined && citation.beg_page !== null)) {
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
              button.onclick = () => navigateToPage(replacement.citation!.beg_page || 1)
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

  return (
    <div className="tab-panel">
      <div className="tab-header">
        <h3>Contract Chat</h3>
        <div className="tab-header-actions">
          {getIngestCTA()}
        </div>
      </div>

      <div className="chat-container">
        {isChatLoading ? (
          <div className="issues-loading">
            <Spinner size="large" />
            <p>Loading chat...</p>
          </div>
        ) : (
          <>
            <div className="chat-messages">
              {chatMessages.length === 0 && (
                <div className="empty-state">
                  <p>No messages yet. Start a new conversation below.</p>
                </div>
              )}
              {chatMessages.map((msg) => (
                <div key={msg.id} className={`chat-message ${msg.role}`}>
                  <div className="chat-message-meta">
                    <span className="role">{msg.role === 'user' ? 'You' : 'Assistant'}</span>
                    <span className={`status ${msg.status.replace('_', '-')}`}>{msg.status.replace('_', ' ')}</span>
                  </div>
                  <div className="chat-message-content">
                    {msg.role === 'assistant' ? (
                      <div className="assistant-content">{renderAssistantContent(msg.content, msg.citations)}</div>
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
                placeholder={contract.status === 'Uploaded' ? 'Ingest the contract before chatting' : 'Type your message and press Enter...'}
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

