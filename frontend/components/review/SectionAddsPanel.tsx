import React from 'react'
import { SectionAddAnnotation } from '../../lib/types/annotation'

interface SectionAddsPanelProps {
  sectionAdds: SectionAddAnnotation[]
  onSectionAddResolve: (annotationId: string, resolution: 'accepted' | 'rejected') => Promise<void>
  onSectionAddDelete: (annotationId: string) => Promise<void>
  resolvingSectionAddId: string | null
  deletingSectionAddId: string | null
  isCollapsed: boolean
  onToggleCollapse: () => void
  height: string
}

export const SectionAddsPanel: React.FC<SectionAddsPanelProps> = ({
  sectionAdds,
  onSectionAddResolve,
  onSectionAddDelete,
  resolvingSectionAddId,
  deletingSectionAddId,
  isCollapsed,
  onToggleCollapse,
  height
}) => {
  // Function to decode HTML entities
  const decodeHtmlEntities = (text: string): string => {
    const textarea = document.createElement('textarea')
    textarea.innerHTML = text
    return textarea.value
  }
  // Filter for pending section additions only
  const pendingSectionAdds = sectionAdds.filter(s => s.status === 'pending')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', cursor: 'pointer', userSelect: 'none' }} onClick={onToggleCollapse}>
        <span style={{ fontSize: '14px', color: '#6b7280', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.2s' }}>▶</span>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Added Sections ({pendingSectionAdds.length})</h3>
      </div>
      {!isCollapsed && (
        <div className="section-adds-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1 }}>
          {pendingSectionAdds.length ? (
            pendingSectionAdds.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((sectionAdd) => (
              <div key={sectionAdd.id} className="section-add-item" style={{ padding: '12px', backgroundColor: sectionAdd.status === 'accepted' ? '#f0fdf4' : sectionAdd.status === 'rejected' ? '#fef2f2' : sectionAdd.status === 'conflict' ? '#fef3c7' : sectionAdd.status === 'stale' ? '#f3f4f6' : '#ffffff', border: sectionAdd.status === 'accepted' ? '1px solid #bbf7d0' : sectionAdd.status === 'rejected' ? '1px solid #fecaca' : sectionAdd.status === 'conflict' ? '1px solid #f59e0b' : sectionAdd.status === 'stale' ? '1px solid #9ca3af' : '1px solid #e5e7eb', borderRadius: '6px', opacity: sectionAdd.status === 'accepted' || sectionAdd.status === 'rejected' || sectionAdd.status === 'conflict' || sectionAdd.status === 'stale' ? 0.8 : 1, cursor: 'pointer' }} onClick={() => { const element = document.querySelector(`[data-section-add-id="${sectionAdd.id}"]`); if (element) (element as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Section {sectionAdd.new_node?.number || 'N/A'}</span>
                  <span>{new Date(sectionAdd.created_at).toLocaleDateString()}</span>
                </div>
                <div style={{ fontSize: '14px', color: sectionAdd.status === 'accepted' ? '#059669' : sectionAdd.status === 'rejected' ? '#dc2626' : sectionAdd.status === 'conflict' ? '#92400e' : sectionAdd.status === 'stale' ? '#6b7280' : '#374151', marginBottom: '8px', textDecoration: sectionAdd.status === 'rejected' || sectionAdd.status === 'stale' ? 'line-through' : 'none' }}>
                  {decodeHtmlEntities(sectionAdd.new_node?.markdown?.split('\n')[0]?.replace(/^#+\s*/, '') || sectionAdd.new_node?.name || 'New Section')}
                </div>
                {sectionAdd.status === 'accepted' ? (
                  <div style={{ fontSize: '12px', color: '#059669', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}><span>✓</span> Accepted</div>
                ) : sectionAdd.status === 'rejected' ? (
                  <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}><span>✗</span> Rejected</div>
                ) : sectionAdd.status === 'conflict' ? (
                  <div style={{ fontSize: '12px', color: '#f59e0b', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}><span>⚠</span> Conflict</div>
                ) : sectionAdd.status === 'stale' ? (
                  <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}><span>⏰</span> Stale</div>
                ) : sectionAdd.status === 'conflict' ? (
                  <button onClick={(e) => { e.stopPropagation(); onSectionAddDelete(sectionAdd.id) }} disabled={deletingSectionAddId === sectionAdd.id} style={{ padding: '4px 8px', border: '1px solid #ef4444', borderRadius: '4px', backgroundColor: '#ffffff', color: deletingSectionAddId === sectionAdd.id ? '#9ca3af' : '#ef4444', fontSize: '12px', cursor: deletingSectionAddId === sectionAdd.id ? 'not-allowed' : 'pointer' }}>
                    {deletingSectionAddId === sectionAdd.id ? 'Deleting...' : 'Dismiss'}
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button onClick={(e) => { e.stopPropagation(); onSectionAddResolve(sectionAdd.id, 'accepted') }} disabled={resolvingSectionAddId === sectionAdd.id} style={{ padding: '4px 8px', border: '1px solid #059669', borderRadius: '4px', backgroundColor: '#ffffff', color: resolvingSectionAddId === sectionAdd.id ? '#9ca3af' : '#059669', fontSize: '12px', cursor: resolvingSectionAddId === sectionAdd.id ? 'not-allowed' : 'pointer' }}>
                      {resolvingSectionAddId === sectionAdd.id ? 'Accepting...' : 'Accept'}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onSectionAddResolve(sectionAdd.id, 'rejected') }} disabled={resolvingSectionAddId === sectionAdd.id} style={{ padding: '4px 8px', border: '1px solid #dc2626', borderRadius: '4px', backgroundColor: '#ffffff', color: resolvingSectionAddId === sectionAdd.id ? '#9ca3af' : '#dc2626', fontSize: '12px', cursor: resolvingSectionAddId === sectionAdd.id ? 'not-allowed' : 'pointer' }}>
                      {resolvingSectionAddId === sectionAdd.id ? 'Rejecting...' : 'Reject'}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onSectionAddDelete(sectionAdd.id) }} disabled={deletingSectionAddId === sectionAdd.id} style={{ padding: '4px 8px', border: '1px solid #ef4444', borderRadius: '4px', backgroundColor: '#ffffff', color: deletingSectionAddId === sectionAdd.id ? '#9ca3af' : '#ef4444', fontSize: '12px', cursor: deletingSectionAddId === sectionAdd.id ? 'not-allowed' : 'pointer' }}>
                      {deletingSectionAddId === sectionAdd.id ? 'Deleting...' : 'Dismiss'}
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <p style={{ color: '#6b7280', fontSize: '14px', fontStyle: 'italic' }}>No pending section additions.</p>
          )}
        </div>
      )}
    </div>
  )
}

