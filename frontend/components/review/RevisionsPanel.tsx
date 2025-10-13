import React, { useState, useEffect } from 'react'
import { RevisionAnnotation } from '../../lib/types/annotation'

interface RevisionsPanelProps {
  revisions: RevisionAnnotation[]
  selectedRevision: RevisionAnnotation | null
  onRevisionSelect: (revision: RevisionAnnotation | null) => void
  onRevisionEdit: (annotationId: string, newText: string) => Promise<void>
  onRevisionResolve: (annotationId: string, resolution: 'accepted' | 'rejected') => Promise<void>
  onRevisionDelete: (annotationId: string) => Promise<void>
  resolvingRevisionId: string | null
  deletingRevisionId: string | null
  isCollapsed: boolean
  onToggleCollapse: () => void
  height: string
}

export const RevisionsPanel: React.FC<RevisionsPanelProps> = ({
  revisions,
  selectedRevision,
  onRevisionSelect,
  onRevisionEdit,
  onRevisionResolve,
  onRevisionDelete,
  resolvingRevisionId,
  deletingRevisionId,
  isCollapsed,
  onToggleCollapse,
  height
}) => {
  const [editingRevision, setEditingRevision] = useState<RevisionAnnotation | null>(null)
  const [editingText, setEditingText] = useState<string>('')

  const handleEditSubmit = async (rev: RevisionAnnotation) => {
    const t = editingText.trim()
    if (t && t !== rev.new_text) {
      await onRevisionEdit(rev.id, t)
    }
    setEditingRevision(null)
    setEditingText('')
  }

  // Filter for pending revisions only
  const pendingRevisions = revisions.filter(r => r.status === 'pending')

  // Scroll to selected revision when it changes
  useEffect(() => {
    if (selectedRevision) {
      const element = document.querySelector(`.revisions-list .revision-item[data-revision-id="${selectedRevision.id}"]`)
      if (element) {
        (element as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [selectedRevision])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', cursor: 'pointer', userSelect: 'none' }} onClick={onToggleCollapse}>
        <span style={{ fontSize: '14px', color: '#6b7280', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.2s' }}>▶</span>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Revisions ({pendingRevisions.length})</h3>
      </div>
      {!isCollapsed && (
        <div className="revisions-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1 }}>
          {pendingRevisions.length ? (
            pendingRevisions.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((rev) => (
              <div key={rev.id} className="revision-item" data-revision-id={rev.id} style={{ padding: '12px', backgroundColor: selectedRevision?.id === rev.id ? '#dbeafe' : '#ffffff', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer' }} onClick={(e) => { const target = e.target as HTMLElement; if (target.closest('button, textarea')) return; onRevisionSelect(selectedRevision?.id === rev.id ? null : rev) }}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Section {rev.node_id}</span>
                  <span>{new Date(rev.created_at).toLocaleDateString()}</span>
                </div>
                <div style={{ fontSize: '14px', color: rev.status === 'accepted' ? '#059669' : rev.status === 'rejected' ? '#dc2626' : rev.status === 'conflict' ? '#92400e' : rev.status === 'stale' ? '#6b7280' : '#dc2626', marginBottom: '8px', textDecoration: rev.status === 'rejected' || rev.status === 'stale' ? 'line-through' : 'none' }}>
                  {rev.new_text}
                </div>
                {rev.status === 'accepted' ? (
                  <div style={{ fontSize: '12px', color: '#059669', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}><span>✓</span> Accepted</div>
                ) : rev.status === 'rejected' ? (
                  <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}><span>✗</span> Rejected</div>
                ) : rev.status === 'conflict' ? (
                  <div style={{ fontSize: '12px', color: '#f59e0b', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}><span>⚠</span> Conflict</div>
                ) : rev.status === 'stale' ? (
                  <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}><span>⏰</span> Stale</div>
                ) : editingRevision?.id === rev.id ? (
                  <div>
                    <textarea value={editingText} onChange={(e) => setEditingText(e.target.value)} onClick={(e) => e.stopPropagation()} style={{ width: '100%', minHeight: '60px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', resize: 'vertical', fontFamily: 'inherit', marginBottom: '8px' }} />
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button onClick={(e) => { e.stopPropagation(); setEditingRevision(null); setEditingText('') }} style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#ffffff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                      <button onClick={(e) => { e.stopPropagation(); handleEditSubmit(rev) }} style={{ padding: '4px 8px', border: 'none', borderRadius: '4px', backgroundColor: '#3b82f6', color: '#ffffff', fontSize: '12px', cursor: 'pointer' }}>Save</button>
                    </div>
                  </div>
                ) : rev.status === 'conflict' || rev.status === 'stale' ? (
                  <button onClick={(e) => { e.stopPropagation(); onRevisionDelete(rev.id) }} disabled={deletingRevisionId === rev.id} style={{ padding: '4px 8px', border: '1px solid #ef4444', borderRadius: '4px', backgroundColor: '#ffffff', color: deletingRevisionId === rev.id ? '#9ca3af' : '#ef4444', fontSize: '12px', cursor: deletingRevisionId === rev.id ? 'not-allowed' : 'pointer' }}>
                    {deletingRevisionId === rev.id ? 'Deleting...' : 'Dismiss'}
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button onClick={(e) => { e.stopPropagation(); setEditingRevision(rev); setEditingText(rev.new_text) }} style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#ffffff', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>Edit</button>
                    <button onClick={(e) => { e.stopPropagation(); onRevisionResolve(rev.id, 'accepted') }} disabled={resolvingRevisionId === rev.id} style={{ padding: '4px 8px', border: '1px solid #059669', borderRadius: '4px', backgroundColor: '#ffffff', color: resolvingRevisionId === rev.id ? '#9ca3af' : '#059669', fontSize: '12px', cursor: resolvingRevisionId === rev.id ? 'not-allowed' : 'pointer' }}>
                      {resolvingRevisionId === rev.id ? 'Accepting...' : 'Accept'}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onRevisionResolve(rev.id, 'rejected') }} disabled={resolvingRevisionId === rev.id} style={{ padding: '4px 8px', border: '1px solid #dc2626', borderRadius: '4px', backgroundColor: '#ffffff', color: resolvingRevisionId === rev.id ? '#9ca3af' : '#dc2626', fontSize: '12px', cursor: resolvingRevisionId === rev.id ? 'not-allowed' : 'pointer' }}>
                      {resolvingRevisionId === rev.id ? 'Rejecting...' : 'Reject'}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onRevisionDelete(rev.id) }} disabled={deletingRevisionId === rev.id} style={{ padding: '4px 8px', border: '1px solid #ef4444', borderRadius: '4px', backgroundColor: '#ffffff', color: deletingRevisionId === rev.id ? '#9ca3af' : '#ef4444', fontSize: '12px', cursor: deletingRevisionId === rev.id ? 'not-allowed' : 'pointer' }}>
                      {deletingRevisionId === rev.id ? 'Deleting...' : 'Dismiss'}
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <p style={{ color: '#6b7280', fontSize: '14px', fontStyle: 'italic' }}>No pending revisions. Select text and choose Suggest Revision.</p>
          )}
        </div>
      )}
    </div>
  )
}

