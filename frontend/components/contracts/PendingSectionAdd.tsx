import React from 'react'
import { SectionAddAnnotation } from './types'

interface PendingSectionAddProps {
  sectionAdd: SectionAddAnnotation
  depth: number
  isExpanded: boolean
  onToggleExpand: () => void
}

const PendingSectionAdd: React.FC<PendingSectionAddProps> = ({
  sectionAdd,
  depth,
  isExpanded,
  onToggleExpand
}) => {
  const indentStyle = { marginLeft: `${depth * 20}px` }

  return (
    <div
      key={`pending-${sectionAdd.id}`}
      className="pending-section-node"
      data-section-add-id={sectionAdd.id}
      style={indentStyle}
    >
      <div
        className="pending-section-header"
        style={{
          padding: '8px 12px',
          border: '1px solid #bbf7d0',
          borderRadius: '6px',
          marginBottom: '4px',
          backgroundColor: '#f0fdf4',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          position: 'relative',
          cursor: 'pointer'
        }}
        onClick={onToggleExpand}
      >
        {/* Left side: Expander, + sign, and section number */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
          <div
            style={{
              width: '16px',
              height: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              color: '#6b7280',
              flexShrink: 0,
              marginTop: '2px',
              transition: 'transform 0.2s',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'
            }}
          >
            ▶
          </div>
          <span style={{ fontSize: '16px', color: '#059669', fontWeight: '600', flexShrink: 0, marginTop: '0px' }}>
            +
          </span>
          <span
            style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#1f2937',
              backgroundColor: '#bbf7d0',
              padding: '2px 6px',
              borderRadius: '4px',
              flexShrink: 0
            }}
          >
            {sectionAdd.new_node?.number || 'New Section'}
          </span>
        </div>

        {/* Right side: Section content */}
        <div className="pending-section-info" style={{ flex: 1, minWidth: 0 }}>
          {isExpanded && (
            <div
              style={{
                fontSize: '14px',
                color: '#059669',
                lineHeight: '1.6'
              }}
            >
              {sectionAdd.new_node?.markdown?.split('\n')[0]?.replace(/^#+\s*/, '') ||
                sectionAdd.new_node?.name ||
                'New Section'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PendingSectionAdd

