import React, { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Contract, ContractSectionCitation } from '../../lib/types'
import { ChatMessageAttachment } from '../../lib/types/agent'
import { SavedPrompt } from '../../lib/types/saved-prompt'
import { useAgentChat } from '../../hooks/useAgentChat'
import { Spinner } from '../common/Spinner'
import { useNotificationContext } from '../common/NotificationProvider'
import { AgentProgressPanel } from './AgentProgressPanel'
import { SavedPromptVariableModal } from './SavedPromptVariableModal'
import { fetchContracts } from '../../lib/api'
import { fetchSavedPrompts } from '../../lib/api/saved-prompts'

interface AgentChatTabProps {
  contract: Contract
  contractId: string | undefined
  isAnalyzing: boolean
  onIngest: () => void
  navigateToPage: (page: number) => void
  navigateToSection?: (sectionId: string) => void
  onRunCompleted?: () => void
  onClose?: () => void
  sectionTree?: any
}

export const AgentChatTab: React.FC<AgentChatTabProps> = ({ contract, contractId, isAnalyzing, onIngest, navigateToPage, navigateToSection, onRunCompleted, onClose, sectionTree }) => {
  const { showToast } = useNotificationContext()
  const [expandedProgressPanels, setExpandedProgressPanels] = useState<Set<string>>(new Set())
  const [attachments, setAttachments] = useState<ChatMessageAttachment[]>([])
  const [showSectionDropdown, setShowSectionDropdown] = useState(false)
  const [showContractDropdown, setShowContractDropdown] = useState(false)
  const [showPromptDropdown, setShowPromptDropdown] = useState(false)
  const [availableSections, setAvailableSections] = useState<Array<{ id: string; number: string; name?: string }>>([])
  const [availableContracts, setAvailableContracts] = useState<Contract[]>([])
  const [availablePrompts, setAvailablePrompts] = useState<SavedPrompt[]>([])
  const [selectedPromptForVariables, setSelectedPromptForVariables] = useState<SavedPrompt | null>(null)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [showSectionTooltip, setShowSectionTooltip] = useState(false)
  const [showDocumentTooltip, setShowDocumentTooltip] = useState(false)
  const [showPromptTooltip, setShowPromptTooltip] = useState(false)
  const attachmentAreaRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    // Extract sections from section tree
    if (sectionTree) {
      const sections: Array<{ id: string; number: string; name?: string }> = []
      const extractSections = (node: any) => {
        if (node.type !== 'root') {
          sections.push({ id: node.id, number: node.number, name: node.name })
        }
        if (node.children) {
          node.children.forEach(extractSections)
        }
      }
      extractSections(sectionTree)
      setAvailableSections(sections)
    }
  }, [sectionTree])

  useEffect(() => {
    // Fetch available contracts
    const loadContracts = async () => {
      try {
        const contracts = await fetchContracts()
        setAvailableContracts(contracts.filter(c => c.id !== contractId))
      } catch (error) {
        console.error('Failed to fetch contracts:', error)
      }
    }
    loadContracts()
  }, [contractId])

  useEffect(() => {
    // Fetch available saved prompts
    const loadPrompts = async () => {
      try {
        const prompts = await fetchSavedPrompts()
        setAvailablePrompts(prompts)
      } catch (error) {
        console.error('Failed to fetch saved prompts:', error)
      }
    }
    loadPrompts()
  }, [])

  useEffect(() => {
    // Listen for text selection attachment events
    const handleAttachTextSelection = (event: CustomEvent) => {
      const { nodeId, selectedText } = event.detail
      // Find the section number from the nodeId
      const section = availableSections.find(s => s.id === nodeId)
      if (section && selectedText) {
        addAttachment({ kind: 'pinned_section_text', section_number: section.number, text_span: selectedText })
      }
    }
    window.addEventListener('attach-text-to-chat', handleAttachTextSelection as EventListener)
    return () => window.removeEventListener('attach-text-to-chat', handleAttachTextSelection as EventListener)
  }, [availableSections])

  const addAttachment = (attachment: ChatMessageAttachment) => {
    // Check for duplicates
    const isDuplicate = attachments.some(att => {
      if (att.kind !== attachment.kind) return false
      if (att.kind === 'pinned_section' && attachment.kind === 'pinned_section') {
        return att.section_number === attachment.section_number
      }
      if (att.kind === 'pinned_section_text' && attachment.kind === 'pinned_section_text') {
        return att.section_number === attachment.section_number && att.text_span === attachment.text_span
      }
      if (att.kind === 'pinned_precedent_document' && attachment.kind === 'pinned_precedent_document') {
        return att.contract_id === attachment.contract_id
      }
      return false
    })
    if (!isDuplicate) {
      setAttachments([...attachments, attachment])
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)
    
    try {
      const data = e.dataTransfer.getData('application/json')
      if (data) {
        const { type, sectionNumber } = JSON.parse(data)
        if (type === 'section' && sectionNumber) {
          addAttachment({ kind: 'pinned_section', section_number: sectionNumber })
        }
      }
    } catch (error) {
      console.error('Failed to parse drag data:', error)
    }
  }

  const handleSendMessage = () => {
    sendMessage(attachments.length > 0 ? attachments : undefined)
    setAttachments([])
  }

  const handlePromptSelect = (prompt: SavedPrompt) => {
    setShowPromptDropdown(false)
    
    if (prompt.variables.length === 0) {
      // No variables, directly insert the prompt text
      setChatInput(prompt.text)
    } else {
      // Has variables, show modal for variable resolution
      setSelectedPromptForVariables(prompt)
    }
  }

  const handlePromptVariablesSubmit = (resolvedText: string) => {
    setChatInput(resolvedText)
  }

  const getAttachmentDisplay = (attachment: ChatMessageAttachment) => {
    if (attachment.kind === 'pinned_section') {
      return `§ ${attachment.section_number}`
    } else if (attachment.kind === 'pinned_section_text') {
      const truncatedText = attachment.text_span.length > 30 ? attachment.text_span.substring(0, 30) + '...' : attachment.text_span
      return `§ ${attachment.section_number}: "${truncatedText}"`
    } else if (attachment.kind === 'pinned_precedent_document') {
      const contract = availableContracts.find(c => c.id === attachment.contract_id)
      return contract ? `📄 ${contract.filename}` : `📄 Document`
    }
    return ''
  }

  const extractCitationsFromMessage = (msg: any) => {
    if (!msg.attachments || msg.attachments.length === 0) return undefined
    const citationAttachment = msg.attachments.find((att: any) => att.kind === 'response_citations')
    return citationAttachment?.citations
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
      {selectedPromptForVariables && (
        <SavedPromptVariableModal
          prompt={selectedPromptForVariables}
          onClose={() => setSelectedPromptForVariables(null)}
          onSubmit={handlePromptVariablesSubmit}
        />
      )}
      
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
                        {renderAssistantContent(msg.content, extractCitationsFromMessage(msg))}
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

            <div className="chat-input-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
              {attachments.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', width: '100%' }}>
                  {attachments.map((attachment, index) => (
                    <div key={index} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', backgroundColor: '#e0e7ff', border: '1px solid #c7d2fe', borderRadius: '16px', fontSize: '13px' }}>
                      <span>{getAttachmentDisplay(attachment)}</span>
                      <button onClick={() => removeAttachment(index)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center', color: '#6b7280' }} title="Remove">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div ref={attachmentAreaRef} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} style={{ width: '100%', border: isDraggingOver ? '2px dashed #3b82f6' : 'none', borderRadius: '6px', padding: isDraggingOver ? '8px' : '0', transition: 'all 0.2s' }}>
                <textarea
                  className="form-input"
                  placeholder={contract.status === 'Uploaded' ? 'You must ingest the contract before chatting with the agent' : 'Ask the agent...'}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  disabled={isSendingMessage || contract.status === 'Uploaded' || contract.status === 'Ingesting'}
                  rows={1}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement
                    target.style.height = 'auto'
                    target.style.height = Math.min(target.scrollHeight, 150) + 'px'
                  }}
                  style={{ width: '100%', resize: 'none', minHeight: '40px', maxHeight: '150px', overflow: 'auto', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                <div style={{ position: 'relative', flex: '1' }}>
                  <button 
                    onClick={() => { setShowPromptDropdown(!showPromptDropdown); setShowSectionDropdown(false); setShowContractDropdown(false) }} 
                    className="pin-button"
                    style={{ 
                      width: '100%', 
                      padding: '8px 14px', 
                      fontSize: '13px', 
                      backgroundColor: '#f0f4ff', 
                      border: '1px solid #bfdbfe', 
                      borderRadius: '6px', 
                      cursor: 'pointer', 
                      textAlign: 'left', 
                      fontWeight: '500',
                      color: '#1e40af',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>💬 Use Saved Prompt</span>
                    <span
                      style={{ 
                        marginLeft: 'auto',
                        display: 'inline-flex',
                        alignItems: 'center',
                        flexShrink: 0,
                        cursor: 'help',
                        position: 'relative'
                      }}
                      onMouseEnter={() => setShowPromptTooltip(true)}
                      onMouseLeave={() => setShowPromptTooltip(false)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <svg 
                        width="16" 
                        height="16" 
                        viewBox="0 0 24 24" 
                        fill="none"
                        style={{ display: 'block' }}
                      >
                        <circle cx="12" cy="12" r="10" stroke="#1e40af" strokeWidth="2" fill="none"/>
                        <path d="M12 16v-4M12 8h.01" stroke="#1e40af" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      {showPromptTooltip && (
                        <span style={{
                          position: 'absolute',
                          bottom: '100%',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          marginBottom: '8px',
                          padding: '6px 10px',
                          backgroundColor: '#1f2937',
                          color: '#ffffff',
                          fontSize: '12px',
                          borderRadius: '6px',
                          whiteSpace: 'nowrap',
                          zIndex: 1001,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                          pointerEvents: 'none'
                        }}>
                          Insert a saved prompt template into the chat input
                          <span style={{
                            position: 'absolute',
                            top: '100%',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: '0',
                            height: '0',
                            borderLeft: '6px solid transparent',
                            borderRight: '6px solid transparent',
                            borderTop: '6px solid #1f2937'
                          }}></span>
                        </span>
                      )}
                    </span>
                  </button>
                  {showPromptDropdown && (
                    <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: '4px', maxHeight: '200px', overflowY: 'auto', backgroundColor: '#ffffff', border: '1px solid #d1d5db', borderRadius: '6px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 1000 }}>
                      {availablePrompts.length === 0 ? (
                        <div style={{ padding: '12px', fontSize: '13px', color: '#6b7280', textAlign: 'center' }}>
                          No saved prompts found
                        </div>
                      ) : (
                        availablePrompts.map((prompt) => (
                          <button 
                            key={prompt.id} 
                            onClick={() => handlePromptSelect(prompt)} 
                            style={{ 
                              width: '100%', 
                              padding: '8px 12px', 
                              fontSize: '13px', 
                              textAlign: 'left', 
                              border: 'none', 
                              backgroundColor: '#ffffff', 
                              cursor: 'pointer', 
                              borderBottom: '1px solid #e5e7eb',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <span style={{ flex: 1 }}>{prompt.name}</span>
                            {prompt.variables.length > 0 && (
                              <span style={{ fontSize: '11px', padding: '2px 6px', backgroundColor: '#dbeafe', color: '#1e40af', borderRadius: '10px', fontWeight: '600' }}>
                                {prompt.variables.length} {prompt.variables.length === 1 ? 'var' : 'vars'}
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div style={{ position: 'relative', flex: '1' }}>
                  <button 
                    onClick={() => { setShowSectionDropdown(!showSectionDropdown); setShowContractDropdown(false); setShowPromptDropdown(false) }} 
                    className="pin-button"
                    style={{ 
                      width: '100%', 
                      padding: '8px 14px', 
                      fontSize: '13px', 
                      backgroundColor: '#f0f4ff', 
                      border: '1px solid #bfdbfe', 
                      borderRadius: '6px', 
                      cursor: 'pointer', 
                      textAlign: 'left', 
                      fontWeight: '500',
                      color: '#1e40af',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>📌 Pin Contract Section</span>
                    <span
                      style={{ 
                        marginLeft: 'auto',
                        display: 'inline-flex',
                        alignItems: 'center',
                        flexShrink: 0,
                        cursor: 'help',
                        position: 'relative'
                      }}
                      onMouseEnter={() => setShowSectionTooltip(true)}
                      onMouseLeave={() => setShowSectionTooltip(false)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <svg 
                        width="16" 
                        height="16" 
                        viewBox="0 0 24 24" 
                        fill="none"
                        style={{ display: 'block' }}
                      >
                        <circle cx="12" cy="12" r="10" stroke="#1e40af" strokeWidth="2" fill="none"/>
                        <path d="M12 16v-4M12 8h.01" stroke="#1e40af" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      {showSectionTooltip && (
                        <span style={{
                          position: 'absolute',
                          bottom: '100%',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          marginBottom: '8px',
                          padding: '6px 10px',
                          backgroundColor: '#1f2937',
                          color: '#ffffff',
                          fontSize: '12px',
                          borderRadius: '6px',
                          whiteSpace: 'nowrap',
                          zIndex: 1001,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                          pointerEvents: 'none'
                        }}>
                          Add a specific contract section to the agent's context
                          <span style={{
                            position: 'absolute',
                            top: '100%',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: '0',
                            height: '0',
                            borderLeft: '6px solid transparent',
                            borderRight: '6px solid transparent',
                            borderTop: '6px solid #1f2937'
                          }}></span>
                        </span>
                      )}
                    </span>
                  </button>
                  {showSectionDropdown && (
                    <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: '4px', maxHeight: '200px', overflowY: 'auto', backgroundColor: '#ffffff', border: '1px solid #d1d5db', borderRadius: '6px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 1000 }}>
                      {availableSections.map((section) => (
                        <button key={section.id} onClick={() => { addAttachment({ kind: 'pinned_section', section_number: section.number }); setShowSectionDropdown(false) }} style={{ width: '100%', padding: '8px 12px', fontSize: '13px', textAlign: 'left', border: 'none', backgroundColor: '#ffffff', cursor: 'pointer', borderBottom: '1px solid #e5e7eb' }}>
                          {section.number}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ position: 'relative', flex: '1' }}>
                  <button 
                    onClick={() => { setShowContractDropdown(!showContractDropdown); setShowSectionDropdown(false); setShowPromptDropdown(false) }} 
                    className="pin-button"
                    style={{ 
                      width: '100%', 
                      padding: '8px 14px', 
                      fontSize: '13px', 
                      backgroundColor: '#f0f4ff', 
                      border: '1px solid #bfdbfe', 
                      borderRadius: '6px', 
                      cursor: 'pointer', 
                      textAlign: 'left', 
                      fontWeight: '500',
                      color: '#1e40af',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>📄 Pin Precedent Document</span>
                    <span
                      style={{ 
                        marginLeft: 'auto',
                        display: 'inline-flex',
                        alignItems: 'center',
                        flexShrink: 0,
                        cursor: 'help',
                        position: 'relative'
                      }}
                      onMouseEnter={() => setShowDocumentTooltip(true)}
                      onMouseLeave={() => setShowDocumentTooltip(false)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <svg 
                        width="16" 
                        height="16" 
                        viewBox="0 0 24 24" 
                        fill="none"
                        style={{ display: 'block' }}
                      >
                        <circle cx="12" cy="12" r="10" stroke="#1e40af" strokeWidth="2" fill="none"/>
                        <path d="M12 16v-4M12 8h.01" stroke="#1e40af" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      {showDocumentTooltip && (
                        <span style={{
                          position: 'absolute',
                          bottom: '100%',
                          right: '0',
                          marginBottom: '8px',
                          padding: '6px 10px',
                          backgroundColor: '#1f2937',
                          color: '#ffffff',
                          fontSize: '12px',
                          borderRadius: '6px',
                          whiteSpace: 'nowrap',
                          zIndex: 1001,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                          pointerEvents: 'none'
                        }}>
                          Add a precedent document to guide the agent's annotations
                          <span style={{
                            position: 'absolute',
                            top: '100%',
                            right: '8px',
                            width: '0',
                            height: '0',
                            borderLeft: '6px solid transparent',
                            borderRight: '6px solid transparent',
                            borderTop: '6px solid #1f2937'
                          }}></span>
                        </span>
                      )}
                    </span>
                  </button>
                  {showContractDropdown && (
                    <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: '4px', maxHeight: '200px', overflowY: 'auto', backgroundColor: '#ffffff', border: '1px solid #d1d5db', borderRadius: '6px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 1000 }}>
                      {availableContracts.map((c) => (
                        <button key={c.id} onClick={() => { addAttachment({ kind: 'pinned_precedent_document', contract_id: c.id }); setShowContractDropdown(false) }} style={{ width: '100%', padding: '8px 12px', fontSize: '13px', textAlign: 'left', border: 'none', backgroundColor: '#ffffff', cursor: 'pointer', borderBottom: '1px solid #e5e7eb' }}>
                          {c.filename}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                <button className="cta-button primary" onClick={handleSendMessage} disabled={isSendingMessage || !chatInput.trim() || contract.status === 'Uploaded' || contract.status === 'Ingesting'} style={{ flex: 1 }}>
                  {isSendingMessage ? (<><Spinner size="small" />Sending...</>) : ('Send Message')}
                </button>
                <button className="cta-button secondary" onClick={handleNewChat} disabled={isSendingMessage} style={{ flex: 1 }}>
                  New Chat
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}