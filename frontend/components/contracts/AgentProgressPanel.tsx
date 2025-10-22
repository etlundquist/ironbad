import React, { useState, useEffect, useRef } from 'react'
import { AgentChatMessage, AgentChatMessageStatus } from '../../lib/types/agent'

interface ProgressStep {
  type: 'tool_call' | 'reasoning'
  data: any
  timestamp: number
}

interface AgentProgressPanelProps {
  message: AgentChatMessage
  progressSteps: ProgressStep[]
  isExpanded: boolean
  setExpanded: (expanded: boolean) => void
}

export function AgentProgressPanel({ message, progressSteps, isExpanded, setExpanded }: AgentProgressPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const userInteractedRef = useRef(false)
  const isInProgress = message.status === 'in_progress' || message.status === 'responding'

  // Auto-scroll to this panel when it's expanded and in progress
  useEffect(() => {
    if (isExpanded && isInProgress && panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isExpanded, isInProgress, progressSteps.length])

  // Reset user interaction flag when message status changes to in_progress
  useEffect(() => {
    if (isInProgress) {
      userInteractedRef.current = false
    }
  }, [isInProgress])

  // Auto-expand when in progress
  // Only auto-expand if we haven't manually interacted with this panel
  useEffect(() => {
    if (isInProgress && !isExpanded && !userInteractedRef.current && progressSteps.length === 0) {
      // Only auto-expand for new messages with no progress steps
      setExpanded(true)
    }
  }, [isInProgress, isExpanded, setExpanded, progressSteps.length])

  // Auto-collapse when completed (but do not override manual expansion)
  useEffect(() => {
    if (!isInProgress && isExpanded && !userInteractedRef.current) {
      setExpanded(false)
    }
  }, [isInProgress, isExpanded, setExpanded])

  const handleHeaderClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    userInteractedRef.current = true
    setExpanded(!isExpanded)
  }

  // Show the panel if there are progress steps OR if the message is in progress
  if (progressSteps.length === 0 && !isInProgress) {
    return null
  }

  const formatToolArgs = (args: Record<string, any>): string => {
    try {
      return JSON.stringify(args, null, 2)
    } catch {
      return String(args)
    }
  }

  const getToolIcon = (toolName: string): string => {
    // Map tool names to appropriate icons
    const toolIcons: Record<string, string> = {
      'search_contract_sections': '🔍',
      'get_contract_section': '📄',
      'create_annotation': '📝',
      'update_annotation': '✏️',
      'delete_annotation': '🗑️',
      'get_annotations': '📋',
      'get_contract_metadata': '📊',
      'update_contract_metadata': '📊',
      'get_contract_sections': '📑',
      'get_contract_issues': '⚠️',
      'create_contract_issue': '⚠️',
      'update_contract_issue': '⚠️',
      'delete_contract_issue': '⚠️'
    }
    return toolIcons[toolName] || '🔧'
  }

  return (
    <div className="agent-progress-panel" ref={panelRef}>
      <div 
        className="progress-header" 
        onClick={handleHeaderClick}
        style={{
          cursor: 'pointer',
          padding: '8px 12px',
          backgroundColor: '#1f2937',
          borderTop: '1px solid #374151',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: '#9ca3af',
          userSelect: 'none'
        }}
      >
        <span>
          {progressSteps.length === 0 
            ? 'Agent Progress'
            : `Agent Progress (${progressSteps.length} step${progressSteps.length !== 1 ? 's' : ''})`
          }
        </span>
        <span style={{ fontSize: '14px' }}>
          {isExpanded ? '▼' : '▶'}
        </span>
      </div>
      
      {isExpanded && (
        <div 
          className="progress-content"
          style={{
            backgroundColor: '#000000',
            color: '#ffffff',
            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
            fontSize: '12px',
            lineHeight: '1.4',
            maxHeight: '300px',
            overflowY: 'auto'
          }}
        >
          {progressSteps.length === 0 ? (
            <div style={{
              padding: '12px',
              color: '#9ca3af',
              fontStyle: 'italic',
              textAlign: 'center'
            }}>
            </div>
          ) : (
            progressSteps.map((step, index) => (
            <div 
              key={index}
              style={{
                padding: '8px 12px',
                borderBottom: index < progressSteps.length - 1 ? '1px solid #333333' : 'none'
              }}
            >
              {step.type === 'tool_call' ? (
                <div>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    marginBottom: '4px',
                    color: '#60a5fa'
                  }}>
                    <span style={{ marginRight: '6px' }}>
                      {getToolIcon(step.data.tool_name)}
                    </span>
                    <span style={{ fontWeight: 'bold' }}>
                      Calling Tool: {step.data.tool_name}
                    </span>
                  </div>
                  <div style={{ 
                    marginLeft: '20px',
                    color: '#d1d5db',
                    fontSize: '11px'
                  }}>
                    <pre style={{ 
                      margin: 0, 
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}>
                      {formatToolArgs(step.data.tool_call_args)}
                    </pre>
                  </div>
                </div>
              ) : step.type === 'reasoning' ? (
                <div>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    marginBottom: '4px',
                    color: '#fbbf24'
                  }}>
                    <span style={{ marginRight: '6px' }}>🧠</span>
                    <span style={{ fontWeight: 'bold' }}>
                      Reasoning
                    </span>
                  </div>
                  <div style={{ 
                    marginLeft: '20px',
                    color: '#d1d5db',
                    fontSize: '11px'
                  }}>
                    {step.data.reasoning_summary}
                  </div>
                </div>
              ) : null}
            </div>
          ))
          )}
        </div>
      )}
    </div>
  )
}
