import React from 'react'
import { CommentAnnotation, RevisionAnnotation, SectionAddAnnotation, SectionRemoveAnnotation } from '../../lib/types/annotation'

interface ChangelogPanelProps {
  comments: CommentAnnotation[]
  revisions: RevisionAnnotation[]
  sectionAdds: SectionAddAnnotation[]
  sectionRemoves: SectionRemoveAnnotation[]
  isCollapsed: boolean
  onToggleCollapse: () => void
  height: string
}

export const ChangelogPanel: React.FC<ChangelogPanelProps> = ({
  comments,
  revisions,
  sectionAdds,
  sectionRemoves,
  isCollapsed,
  onToggleCollapse,
  height
}) => {
  // Filter for resolved annotations
  const resolvedComments = comments.filter(c => c.status === 'resolved')
  const resolvedRevisions = revisions.filter(r => ['accepted', 'rejected'].includes(r.status))
  const resolvedSectionAdds = sectionAdds.filter(s => ['accepted', 'rejected'].includes(s.status))
  const resolvedSectionRemoves = sectionRemoves.filter(s => ['accepted', 'rejected'].includes(s.status))

  // Combine all resolved items with timestamps
  const allResolved: Array<{
    type: 'comment' | 'revision' | 'section_add' | 'section_remove'
    data: CommentAnnotation | RevisionAnnotation | SectionAddAnnotation | SectionRemoveAnnotation
    timestamp: string
  }> = [
    ...resolvedComments.map(c => ({ type: 'comment' as const, data: c, timestamp: c.created_at })),
    ...resolvedRevisions.map(r => ({ type: 'revision' as const, data: r, timestamp: r.created_at })),
    ...resolvedSectionAdds.map(s => ({ type: 'section_add' as const, data: s, timestamp: s.created_at })),
    ...resolvedSectionRemoves.map(s => ({ type: 'section_remove' as const, data: s, timestamp: s.created_at }))
  ]

  // Sort by timestamp (newest first)
  allResolved.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'comment': return '💬'
      case 'revision': return '✏️'
      case 'section_add': return '➕'
      case 'section_remove': return '➖'
      default: return '•'
    }
  }

  const getItemLabel = (type: string) => {
    switch (type) {
      case 'comment': return 'Comment'
      case 'revision': return 'Revision'
      case 'section_add': return 'Added Section'
      case 'section_remove': return 'Removed Section'
      default: return 'Change'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved': return { bg: '#f0fdf4', border: '#bbf7d0', text: '#059669' }
      case 'accepted': return { bg: '#f0fdf4', border: '#bbf7d0', text: '#059669' }
      case 'rejected': return { bg: '#fef2f2', border: '#fecaca', text: '#dc2626' }
      default: return { bg: '#f3f4f6', border: '#d1d5db', text: '#6b7280' }
    }
  }

  const getItemDescription = (item: typeof allResolved[0]) => {
    const data = item.data as any
    switch (item.type) {
      case 'comment':
        return data.comment_text.substring(0, 60) + (data.comment_text.length > 60 ? '...' : '')
      case 'revision':
        return `"${data.old_text.substring(0, 30)}..." → "${data.new_text.substring(0, 30)}..."`
      case 'section_add':
        return data.new_node?.markdown?.split('\n')[0]?.replace(/^#+\s*/, '').substring(0, 60) || 'New Section'
      case 'section_remove':
        return `Section ${data.node_id}`
      default:
        return ''
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', cursor: 'pointer', userSelect: 'none' }} onClick={onToggleCollapse}>
        <span style={{ fontSize: '14px', color: '#6b7280', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.2s' }}>▶</span>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Changelog ({allResolved.length})</h3>
      </div>
      {!isCollapsed && (
        <div className="changelog-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1 }}>
          {allResolved.length ? (
            allResolved.map((item, index) => {
              const data = item.data as any
              const colors = getStatusColor(data.status)
              return (
                <div key={`${item.type}-${data.id}-${index}`} style={{ padding: '10px', backgroundColor: colors.bg, border: `1px solid ${colors.border}`, borderRadius: '6px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '14px' }}>{getItemIcon(item.type)}</span>
                    <span style={{ fontWeight: '600', color: '#374151', fontSize: '12px' }}>{getItemLabel(item.type)}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#6b7280' }}>
                      {new Date(item.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                    {getItemDescription(item)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: colors.text, textTransform: 'uppercase' }}>
                      {data.status}
                    </span>
                    {data.node_id && (
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                        • Section {data.node_id}
                      </span>
                    )}
                    {item.type === 'section_add' && data.new_node?.number && (
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                        • Section {data.new_node.number}
                      </span>
                    )}
                  </div>
                </div>
              )
            })
          ) : (
            <p style={{ color: '#6b7280', fontSize: '14px', fontStyle: 'italic' }}>No resolved changes yet.</p>
          )}
        </div>
      )}
    </div>
  )
}

