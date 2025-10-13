import React, { useState, useEffect } from 'react'
import { CommentAnnotation } from '../../lib/types/annotation'

interface CommentsPanelProps {
  comments: CommentAnnotation[]
  selectedComment: CommentAnnotation | null
  onCommentSelect: (comment: CommentAnnotation | null) => void
  onCommentEdit: (annotationId: string, commentText: string) => Promise<void>
  onCommentResolve: (annotationId: string) => Promise<void>
  onCommentDelete: (annotationId: string) => Promise<void>
  resolvingCommentId: string | null
  deletingCommentId: string | null
  isCollapsed: boolean
  onToggleCollapse: () => void
  height: string
}

export const CommentsPanel: React.FC<CommentsPanelProps> = ({
  comments,
  selectedComment,
  onCommentSelect,
  onCommentEdit,
  onCommentResolve,
  onCommentDelete,
  resolvingCommentId,
  deletingCommentId,
  isCollapsed,
  onToggleCollapse,
  height
}) => {
  const [editingComment, setEditingComment] = useState<CommentAnnotation | null>(null)
  const [editingText, setEditingText] = useState<string>('')

  const handleEditClick = (comment: CommentAnnotation) => {
    setEditingComment(comment)
    setEditingText(comment.comment_text)
    onCommentSelect(comment)
  }

  const handleEditSubmit = async () => {
    if (editingComment) {
      const newText = editingText.trim()
      if (newText && newText !== editingComment.comment_text) {
        await onCommentEdit(editingComment.id, newText)
      }
      setEditingComment(null)
    }
  }

  // Filter for pending comments only
  const pendingComments = comments.filter(c => c.status === 'pending')

  // Scroll to selected comment when it changes
  useEffect(() => {
    if (selectedComment) {
      const element = document.querySelector(`.comments-list .comment-item[data-comment-id="${selectedComment.id}"]`)
      if (element) {
        (element as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [selectedComment])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', cursor: 'pointer', userSelect: 'none' }} onClick={onToggleCollapse}>
        <span style={{ fontSize: '14px', color: '#6b7280', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.2s' }}>▶</span>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Comments ({pendingComments.length})</h3>
      </div>
      {!isCollapsed && (
        <div className="comments-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1 }}>
          {pendingComments.length ? (
            pendingComments.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((comment) => (
              <div key={comment.id} className={`comment-item ${selectedComment?.id === comment.id ? 'selected' : ''}`} data-comment-id={comment.id} style={{ padding: '12px', backgroundColor: selectedComment?.id === comment.id ? '#dbeafe' : '#ffffff', border: '1px solid #e5e7eb', borderRadius: '6px', transition: 'all 0.2s', position: 'relative', cursor: 'pointer' }} onClick={() => onCommentSelect(selectedComment?.id === comment.id ? null : comment)}>
                {selectedComment?.id === comment.id && <div style={{ position: 'absolute', left: '-8px', top: '50%', transform: 'translateY(-50%)', width: '4px', height: '20px', backgroundColor: '#3b82f6', borderRadius: '2px' }} />}
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Section {comment.node_id}</span>
                  <span>{new Date(comment.created_at).toLocaleDateString()}</span>
                </div>
                {editingComment?.id === comment.id ? (
                  <div>
                    <textarea value={editingText} onChange={(e) => setEditingText(e.target.value)} style={{ width: '100%', minHeight: '60px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', resize: 'vertical', fontFamily: 'inherit', marginBottom: '8px' }} autoFocus />
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button onClick={() => setEditingComment(null)} style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#ffffff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                      <button onClick={handleEditSubmit} style={{ padding: '4px 8px', border: 'none', borderRadius: '4px', backgroundColor: '#3b82f6', color: '#ffffff', fontSize: '12px', cursor: 'pointer' }}>Save</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '14px', color: comment.status === 'resolved' ? '#6b7280' : comment.status === 'conflict' ? '#92400e' : comment.status === 'stale' ? '#6b7280' : '#374151', marginBottom: '8px', textDecoration: comment.status === 'resolved' || comment.status === 'stale' ? 'line-through' : 'none', opacity: comment.status === 'resolved' || comment.status === 'stale' ? 0.7 : 1 }}>
                      {comment.comment_text}
                    </div>
                    {comment.status === 'resolved' ? (
                      <div style={{ fontSize: '12px', color: '#10b981', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>✓</span> Resolved
                      </div>
                    ) : comment.status === 'conflict' || comment.status === 'stale' ? (
                      <button onClick={(e) => { e.stopPropagation(); onCommentDelete(comment.id) }} disabled={deletingCommentId === comment.id} style={{ padding: '4px 8px', border: '1px solid #ef4444', borderRadius: '4px', backgroundColor: '#ffffff', color: deletingCommentId === comment.id ? '#9ca3af' : '#ef4444', fontSize: '12px', cursor: deletingCommentId === comment.id ? 'not-allowed' : 'pointer' }}>
                        {deletingCommentId === comment.id ? 'Deleting...' : 'Dismiss'}
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button onClick={(e) => { e.stopPropagation(); handleEditClick(comment) }} style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#ffffff', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>Edit</button>
                        <button onClick={(e) => { e.stopPropagation(); onCommentResolve(comment.id) }} disabled={resolvingCommentId === comment.id} style={{ padding: '4px 8px', border: '1px solid #10b981', borderRadius: '4px', backgroundColor: '#ffffff', color: resolvingCommentId === comment.id ? '#9ca3af' : '#10b981', fontSize: '12px', cursor: resolvingCommentId === comment.id ? 'not-allowed' : 'pointer' }}>
                          {resolvingCommentId === comment.id ? 'Resolving...' : 'Resolve'}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onCommentDelete(comment.id) }} disabled={deletingCommentId === comment.id} style={{ padding: '4px 8px', border: '1px solid #ef4444', borderRadius: '4px', backgroundColor: '#ffffff', color: deletingCommentId === comment.id ? '#9ca3af' : '#ef4444', fontSize: '12px', cursor: deletingCommentId === comment.id ? 'not-allowed' : 'pointer' }}>
                          {deletingCommentId === comment.id ? 'Deleting...' : 'Dismiss'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            <p style={{ color: '#6b7280', fontSize: '14px', fontStyle: 'italic' }}>No pending comments. Select text in the contract to add a comment.</p>
          )}
        </div>
      )}
    </div>
  )
}

