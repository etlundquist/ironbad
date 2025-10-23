import React from 'react'
import ReactMarkdown from 'react-markdown'
import { ContractSectionNode, SectionRemoveAnnotation, SectionAddAnnotation } from './types'
import PendingSectionAdd from './PendingSectionAdd'

interface SectionNodeProps {
  node: ContractSectionNode
  depth: number
  isExpanded: boolean
  pendingRemoves: SectionRemoveAnnotation[]
  openMenuId: string | null
  expandedPendingAddIds: Set<string>
  onToggleNode: (nodeId: string) => void
  onMenuToggle: (nodeId: string, event: React.MouseEvent) => void
  onMenuAction: (action: string, nodeId: string) => void
  onTextSelection: (nodeId: string, offsetBeg: number, offsetEnd: number, selectedText: string) => void
  decodeHtmlEntities: (text: string) => string
  getPendingSectionAddsForParent: (parentId: string) => SectionAddAnnotation[]
  onTogglePendingAdd: (id: string) => void
  renderSectionNode: (node: ContractSectionNode, depth: number) => React.ReactNode
}

const SectionNode: React.FC<SectionNodeProps> = ({
  node,
  depth,
  isExpanded,
  pendingRemoves,
  openMenuId,
  expandedPendingAddIds,
  onToggleNode,
  onMenuToggle,
  onMenuAction,
  onTextSelection,
  decodeHtmlEntities,
  getPendingSectionAddsForParent,
  onTogglePendingAdd,
  renderSectionNode
}) => {
  const indentStyle = { marginLeft: `${depth * 20}px` }

  const handleTextSelection = (e: React.MouseEvent) => {
    e.stopPropagation()

    const markdownContainer = e.currentTarget
    if (!markdownContainer) return

    setTimeout(() => {
      const selection = window.getSelection()
      if (!selection || selection.toString().trim() === '') return

      const selectedText = selection.toString().trim()
      if (selectedText.length === 0) return

      const range = selection.getRangeAt(0)
      if (!markdownContainer.contains(range.startContainer) || !markdownContainer.contains(range.endContainer)) {
        return
      }

      let offsetBeg = node.markdown.indexOf(selectedText)
      let offsetEnd = -1
      if (offsetBeg !== -1) {
        offsetEnd = offsetBeg + selectedText.length
      } else {
        const preRange = document.createRange()
        preRange.selectNodeContents(markdownContainer)
        preRange.setEnd(range.startContainer, range.startOffset)
        offsetBeg = preRange.toString().length
        offsetEnd = offsetBeg + range.toString().length
      }

      const anchorText = node.markdown.slice(offsetBeg, offsetEnd)
      onTextSelection(node.id, offsetBeg, offsetEnd, anchorText)
    }, 50)
  }

  return (
    <div key={node.id} className="section-node" data-node-id={node.id} style={indentStyle}>
      <div
        className={`section-header ${isExpanded ? 'expanded' : ''}`}
        style={{
          padding: '8px 12px',
          border: pendingRemoves.length > 0 ? '1px solid #fecaca' : '1px solid #e5e7eb',
          borderRadius: '6px',
          marginBottom: '4px',
          backgroundColor: pendingRemoves.length > 0 ? '#fef2f2' : isExpanded ? '#f9fafb' : '#ffffff',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          transition: 'background-color 0.2s',
          position: 'relative'
        }}
      >
        {/* Left side: Expander, +/- sign, and section number */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
          <div
            className="expand-icon"
            onClick={() => onToggleNode(node.id)}
            style={{
              width: '16px',
              height: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              color: pendingRemoves.length > 0 ? '#dc2626' : '#6b7280',
              transition: 'transform 0.2s',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              flexShrink: 0,
              marginTop: '2px',
              cursor: 'pointer'
            }}
          >
            ▶
          </div>
          {pendingRemoves.length > 0 && (
            <span style={{ fontSize: '16px', color: '#dc2626', fontWeight: '600', flexShrink: 0, marginTop: '0px' }}>-</span>
          )}
          <span
            className="section-number"
            onClick={() => onToggleNode(node.id)}
            style={{
              fontWeight: '600',
              color: '#1f2937',
              backgroundColor: pendingRemoves.length > 0 ? '#fecaca' : '#e5e7eb',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '14px',
              flexShrink: 0,
              cursor: 'pointer'
            }}
          >
            {node.number}
          </span>
        </div>

        {/* Right side: Section content */}
        <div className="section-info" style={{ flex: 1, minWidth: 0 }}>
          {isExpanded && node.markdown && (
            <div
              className="section-markdown-inline"
              data-original-markdown={node.markdown}
              style={{
                fontSize: '14px',
                lineHeight: '1.6',
                color: '#374151',
                userSelect: 'text',
                cursor: 'text',
                padding: '0'
              }}
              onMouseUp={handleTextSelection}
            >
              <div>
                <ReactMarkdown>{decodeHtmlEntities(node.markdown)}</ReactMarkdown>
              </div>
            </div>
          )}
          {!isExpanded && node.name && node.level === 1 && (
            <span className="section-name" style={{ color: pendingRemoves.length > 0 ? '#dc2626' : '#4b5563', fontSize: '14px' }}>
              {decodeHtmlEntities(node.name)}
            </span>
          )}
        </div>

        {/* Kebab menu */}
        <div
          className="section-menu"
          onClick={(e) => onMenuToggle(node.id, e)}
          style={{
            position: 'relative',
            padding: '4px',
            cursor: 'pointer',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            height: '24px',
            flexShrink: 0,
            marginTop: '2px'
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#6b7280' }}>
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>

          {openMenuId === node.id && (
            <div
              className="section-menu-dropdown"
              style={{
                position: 'absolute',
                top: '100%',
                right: '0',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                zIndex: 1000,
                minWidth: '160px',
                padding: '4px 0'
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onMenuAction('add-above', node.id)
                }}
                style={{ width: '100%', padding: '8px 12px', border: 'none', backgroundColor: 'transparent', textAlign: 'left', fontSize: '14px', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add section above
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onMenuAction('add-below', node.id)
                }}
                style={{ width: '100%', padding: '8px 12px', border: 'none', backgroundColor: 'transparent', textAlign: 'left', fontSize: '14px', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add section below
              </button>
              <div style={{ height: '1px', backgroundColor: '#e5e7eb', margin: '4px 0' }} />
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onMenuAction('delete', node.id)
                }}
                style={{ width: '100%', padding: '8px 12px', border: 'none', backgroundColor: 'transparent', textAlign: 'left', fontSize: '14px', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
                </svg>
                Delete section
              </button>
            </div>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="section-children" style={{ marginTop: '4px' }}>
          {(() => {
            const pendingAdds = getPendingSectionAddsForParent(node.id)
            const allChildren: Array<{ type: 'existing' | 'pending'; data: any; index: number }> = []

            if (node.children) {
              node.children.forEach((child, index) => {
                allChildren.push({ type: 'existing', data: child, index })
              })
            }

            pendingAdds.forEach((sectionAdd) => {
              allChildren.push({ type: 'pending', data: sectionAdd, index: sectionAdd.insertion_index })
            })

            allChildren.sort((a, b) => a.index - b.index)

            return allChildren.map((item, renderIndex) => {
              if (item.type === 'existing') {
                return renderSectionNode(item.data, depth + 1)
              } else {
                return (
                  <PendingSectionAdd
                    key={`pending-${item.data.id}`}
                    sectionAdd={item.data}
                    depth={depth + 1}
                    isExpanded={expandedPendingAddIds.has(item.data.id)}
                    onToggleExpand={() => onTogglePendingAdd(item.data.id)}
                  />
                )
              }
            })
          })()}
        </div>
      )}
    </div>
  )
}

export default SectionNode

