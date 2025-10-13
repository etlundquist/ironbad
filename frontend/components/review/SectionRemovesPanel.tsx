import React from 'react'
import { SectionRemoveAnnotation } from '../../lib/types/annotation'

interface SectionRemovesPanelProps {
  sectionRemoves: SectionRemoveAnnotation[]
  onSectionRemoveResolve: (annotationId: string, resolution: 'accepted' | 'rejected') => Promise<void>
  onSectionRemoveDelete: (annotationId: string) => Promise<void>
  resolvingSectionRemoveId: string | null
  deletingSectionRemoveId: string | null
  isCollapsed: boolean
  onToggleCollapse: () => void
  height: string
}

export const SectionRemovesPanel: React.FC<SectionRemovesPanelProps> = ({
  sectionRemoves,
  onSectionRemoveResolve,
  onSectionRemoveDelete,
  resolvingSectionRemoveId,
  deletingSectionRemoveId,
  isCollapsed,
  onToggleCollapse,
  height
}) => {
  // Filter for pending section removals only
  const pendingSectionRemoves = sectionRemoves.filter(s => s.status === 'pending')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', cursor: 'pointer', userSelect: 'none' }} onClick={onToggleCollapse}>
        <span style={{ fontSize: '14px', color: '#6b7280', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.2s' }}>▶</span>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Removed Sections ({pendingSectionRemoves.length})</h3>
      </div>
      {!isCollapsed && (
        <div className="section-removes-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1 }}>
          {pendingSectionRemoves.length ? (
            pendingSectionRemoves.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((sectionRemove) => (
              <div key={sectionRemove.id} className="section-remove-item" style={{ padding: '12px', backgroundColor: sectionRemove.status === 'accepted' ? '#f0fdf4' : sectionRemove.status === 'rejected' ? '#fef2f2' : sectionRemove.status === 'conflict' ? '#fef3c7' : sectionRemove.status === 'stale' ? '#f3f4f6' : '#ffffff', border: sectionRemove.status === 'accepted' ? '1px solid #bbf7d0' : sectionRemove.status === 'rejected' ? '1px solid #fecaca' : sectionRemove.status === 'conflict' ? '1px solid #f59e0b' : sectionRemove.status === 'stale' ? '1px solid #9ca3af' : '1px solid #e5e7eb', borderRadius: '6px', opacity: sectionRemove.status === 'accepted' || sectionRemove.status === 'rejected' || sectionRemove.status === 'conflict' || sectionRemove.status === 'stale' ? 0.8 : 1, cursor: 'pointer' }} onClick={() => { const element = document.querySelector(`[data-node-id="${sectionRemove.node_id}"]`); if (element) (element as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Section: {sectionRemove.node_id}</span>
                  <span>{new Date(sectionRemove.created_at).toLocaleDateString()}</span>
                </div>
                <div style={{ fontSize: '14px', color: sectionRemove.status === 'accepted' ? '#059669' : sectionRemove.status === 'rejected' ? '#dc2626' : sectionRemove.status === 'conflict' ? '#92400e' : sectionRemove.status === 'stale' ? '#6b7280' : '#374151', marginBottom: '8px', textDecoration: sectionRemove.status === 'rejected' || sectionRemove.status === 'stale' ? 'line-through' : 'none' }}>
                  Section Removal
                </div>
                {sectionRemove.status === 'accepted' ? (
                  <div style={{ fontSize: '12px', color: '#059669', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}><span>✓</span> Accepted</div>
                ) : sectionRemove.status === 'rejected' ? (
                  <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}><span>✗</span> Rejected</div>
                ) : sectionRemove.status === 'conflict' ? (
                  <div style={{ fontSize: '12px', color: '#f59e0b', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}><span>⚠</span> Conflict</div>
                ) : sectionRemove.status === 'stale' ? (
                  <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}><span>⏰</span> Stale</div>
                ) : sectionRemove.status === 'conflict' ? (
                  <button onClick={(e) => { e.stopPropagation(); onSectionRemoveDelete(sectionRemove.id) }} disabled={deletingSectionRemoveId === sectionRemove.id} style={{ padding: '4px 8px', border: '1px solid #ef4444', borderRadius: '4px', backgroundColor: '#ffffff', color: deletingSectionRemoveId === sectionRemove.id ? '#9ca3af' : '#ef4444', fontSize: '12px', cursor: deletingSectionRemoveId === sectionRemove.id ? 'not-allowed' : 'pointer' }}>
                    {deletingSectionRemoveId === sectionRemove.id ? 'Deleting...' : 'Dismiss'}
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button onClick={(e) => { e.stopPropagation(); onSectionRemoveResolve(sectionRemove.id, 'accepted') }} disabled={resolvingSectionRemoveId === sectionRemove.id} style={{ padding: '4px 8px', border: '1px solid #059669', borderRadius: '4px', backgroundColor: '#ffffff', color: resolvingSectionRemoveId === sectionRemove.id ? '#9ca3af' : '#059669', fontSize: '12px', cursor: resolvingSectionRemoveId === sectionRemove.id ? 'not-allowed' : 'pointer' }}>
                      {resolvingSectionRemoveId === sectionRemove.id ? 'Accepting...' : 'Accept'}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onSectionRemoveResolve(sectionRemove.id, 'rejected') }} disabled={resolvingSectionRemoveId === sectionRemove.id} style={{ padding: '4px 8px', border: '1px solid #dc2626', borderRadius: '4px', backgroundColor: '#ffffff', color: resolvingSectionRemoveId === sectionRemove.id ? '#9ca3af' : '#dc2626', fontSize: '12px', cursor: resolvingSectionRemoveId === sectionRemove.id ? 'not-allowed' : 'pointer' }}>
                      {resolvingSectionRemoveId === sectionRemove.id ? 'Rejecting...' : 'Reject'}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onSectionRemoveDelete(sectionRemove.id) }} disabled={deletingSectionRemoveId === sectionRemove.id} style={{ padding: '4px 8px', border: '1px solid #ef4444', borderRadius: '4px', backgroundColor: '#ffffff', color: deletingSectionRemoveId === sectionRemove.id ? '#9ca3af' : '#ef4444', fontSize: '12px', cursor: deletingSectionRemoveId === sectionRemove.id ? 'not-allowed' : 'pointer' }}>
                      {deletingSectionRemoveId === sectionRemove.id ? 'Deleting...' : 'Dismiss'}
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <p style={{ color: '#6b7280', fontSize: '14px', fontStyle: 'italic' }}>No pending section removals.</p>
          )}
        </div>
      )}
    </div>
  )
}

