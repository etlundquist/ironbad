import { NextPage } from 'next'
import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useNotificationContext } from '../components/NotificationProvider'
import ContractSectionTree from '../components/ContractSectionTree'

interface Contract {
  id: string
  status: string
  filename: string
  filetype: string
  section_tree: any
  annotations?: ContractAnnotations
  meta: any
  created_at: string
  updated_at: string
}

interface CommentAnnotation {
  id: string
  node_id: string
  offset_beg: number
  offset_end: number
  anchor_text: string
  comment_text: string
  status: string
  created_at: string
}

interface RevisionAnnotation {
  id: string
  node_id: string
  offset_beg: number
  offset_end: number
  old_text: string
  new_text: string
  status: string
  created_at: string
}

interface ContractAnnotations {
  comments: CommentAnnotation[]
  revisions: RevisionAnnotation[]
  section_adds: any[]
  section_removes: any[]
}

interface ContractActionRequest {
  action: 'make_comment' | 'edit_comment' | 'make_revision' | 'edit_revision' | 'section_add' | 'section_remove'
  data: any
}

interface ContractActionResponse {
  status: 'applied' | 'rejected' | 'conflict'
  action: string
  action_id: string
  new_contract_version: number
  updated_annotations: ContractAnnotations
}

const ReviewPage: NextPage = () => {
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const [connector, setConnector] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedComment, setSelectedComment] = useState<CommentAnnotation | null>(null)
  const [editingComment, setEditingComment] = useState<CommentAnnotation | null>(null)
  const [editingText, setEditingText] = useState<string>('')
  const [selectedRevision, setSelectedRevision] = useState<RevisionAnnotation | null>(null)
  const [editingRevision, setEditingRevision] = useState<RevisionAnnotation | null>(null)
  const [editingRevisionText, setEditingRevisionText] = useState<string>('')
  const { isConnected } = useNotificationContext()

  useEffect(() => {
    fetchContracts()
  }, [])

  const fetchContracts = async () => {
    try {
      setLoading(true)
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(`${backendUrl}/contracts`)

      if (!response.ok) {
        throw new Error('Failed to fetch contracts')
      }

      const data = await response.json()
      // Filter contracts that are ready for review or under review
      const reviewableContracts = data.filter((contract: Contract) =>
        contract.status === 'Ready for Review' ||
        contract.status === 'Under Review' ||
        contract.status === 'Review Completed'
      )
      setContracts(reviewableContracts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleContractSelect = (contract: Contract) => {
    setSelectedContract(contract)
    setSelectedComment(null)
    setEditingComment(null)
  }

  const handleContractAction = async (contractId: string, action: ContractActionRequest): Promise<ContractActionResponse> => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
    const response = await fetch(`${backendUrl}/contracts/${contractId}/actions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(action),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || 'Failed to perform contract action')
    }

    return response.json()
  }

  const mergeById = <T extends { id: string }>(current: T[] = [], updates: T[] = []): T[] => {
    if (!updates || updates.length === 0) return current || []
    const map = new Map(current?.map(item => [item.id, item]))
    updates.forEach(u => map.set(u.id, u))
    return Array.from(map.values())
  }

  const mergeAnnotations = (current?: ContractAnnotations, updates?: ContractAnnotations): ContractAnnotations => {
    const base: ContractAnnotations = {
      comments: current?.comments || [],
      revisions: current?.revisions || [],
      section_adds: current?.section_adds || [],
      section_removes: current?.section_removes || []
    }
    if (!updates) return base
    return {
      comments: mergeById(base.comments, updates.comments || []),
      revisions: mergeById(base.revisions, updates.revisions || []),
      section_adds: mergeById(base.section_adds as any[], (updates.section_adds || []) as any[]) as any,
      section_removes: mergeById(base.section_removes as any[], (updates.section_removes || []) as any[]) as any,
    }
  }

  const handleCommentCreate = async (nodeId: string, offsetBeg: number, offsetEnd: number, anchorText: string, commentText: string) => {
    if (!selectedContract) return

    try {
      const action: ContractActionRequest = {
        action: 'make_comment',
        data: {
          node_id: nodeId,
          offset_beg: offsetBeg,
          offset_end: offsetEnd,
          anchor_text: anchorText,
          comment_text: commentText
        }
      }

      const response = await handleContractAction(selectedContract.id, action)

      // Merge updated annotations from backend into current state
      setSelectedContract(prev => prev ? {
        ...prev,
        annotations: mergeAnnotations(prev.annotations, response.updated_annotations)
      } : null)

      // Auto-select the newly created comment (first returned updated comment)
      const newComment = response.updated_annotations?.comments?.[0]
      if (newComment) setSelectedComment(newComment)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create comment')
    }
  }

  const handleCommentEdit = async (annotationId: string, commentText: string) => {
    if (!selectedContract) return

    try {
      const action: ContractActionRequest = {
        action: 'edit_comment',
        data: {
          annotation_id: annotationId,
          comment_text: commentText
        }
      }

      const response = await handleContractAction(selectedContract.id, action)

      // Merge updated annotations from backend into current state
      setSelectedContract(prev => prev ? {
        ...prev,
        annotations: mergeAnnotations(prev.annotations, response.updated_annotations)
      } : null)

      // Clear editing state
      setEditingComment(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to edit comment')
    }
  }

  const handleRevisionCreate = async (nodeId: string, offsetBeg: number, offsetEnd: number, oldText: string, newText: string) => {
    if (!selectedContract) return
    try {
      const action: ContractActionRequest = {
        action: 'make_revision',
        data: {
          node_id: nodeId,
          offset_beg: offsetBeg,
          offset_end: offsetEnd,
          old_text: oldText,
          new_text: newText
        }
      }
      const response = await handleContractAction(selectedContract.id, action)
      setSelectedContract(prev => prev ? {
        ...prev,
        annotations: mergeAnnotations(prev.annotations, response.updated_annotations)
      } : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create revision')
    }
  }

  const handleRevisionEdit = async (annotationId: string, newText: string) => {
    if (!selectedContract) return
    try {
      const action: ContractActionRequest = {
        action: 'edit_revision',
        data: {
          annotation_id: annotationId,
          new_text: newText
        }
      }
      const response = await handleContractAction(selectedContract.id, action)
      setSelectedContract(prev => prev ? {
        ...prev,
        annotations: mergeAnnotations(prev.annotations, response.updated_annotations)
      } : null)
      setEditingRevision(null)
      setEditingRevisionText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to edit revision')
    }
  }

  const handleEditCommentClick = (comment: CommentAnnotation) => {
    setEditingComment(comment)
    setEditingText(comment.comment_text)
    setSelectedComment(comment)
  }

  const handleEditCommentSubmit = (newText: string) => {
    if (editingComment) {
      handleCommentEdit(editingComment.id, newText)
    }
  }

  const handleEditCommentCancel = () => {
    setEditingComment(null)
    setEditingText('')
  }

  // Compute and draw connector line between selected comment card and highlighted text
  const recomputeConnector = () => {
    if (!selectedComment || !workspaceRef.current) {
      setConnector(null)
      return
    }
    const wrapper = workspaceRef.current
    const wrapperRect = wrapper.getBoundingClientRect()
    const commentEl = document.querySelector(`.comments-sidebar .comment-item[data-comment-id="${selectedComment.id}"]`) as HTMLElement | null
    const highlightEl = document.querySelector(`[data-comment-id="${selectedComment.id}"]`) as HTMLElement | null
    if (!commentEl || !highlightEl) {
      setConnector(null)
      return
    }
    const cr = commentEl.getBoundingClientRect()
    const hr = highlightEl.getBoundingClientRect()
    const x1 = cr.left - wrapperRect.left
    const y1 = cr.top + cr.height / 2 - wrapperRect.top
    const x2 = hr.right - wrapperRect.left
    const y2 = hr.top + hr.height / 2 - wrapperRect.top
    setConnector({ x1, y1, x2, y2 })
  }

  useEffect(() => {
    recomputeConnector()
    const onResize = () => recomputeConnector()
    window.addEventListener('resize', onResize)

    // Listen to internal scroll containers as well
    const contractScroller = document.querySelector('.contract-viewer .contract-section-tree')
    const sidebarScroller = document.querySelector('.comments-sidebar')
    contractScroller?.addEventListener('scroll', onResize)
    sidebarScroller?.addEventListener('scroll', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      contractScroller?.removeEventListener('scroll', onResize)
      sidebarScroller?.removeEventListener('scroll', onResize)
    }
  }, [selectedComment, selectedContract])

  const getFileIcon = (filetype: string) => {
    if (filetype === 'application/pdf') {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="file-icon pdf">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10,9 9,9 8,9"/>
        </svg>
      )
    } else if (filetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="file-icon docx">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10,9 9,9 8,9"/>
        </svg>
      )
    }
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="file-icon unknown">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
      </svg>
    )
  }

  const getStatusBadge = (status: string) => {
    const statusClasses = {
      'Ready for Review': 'status-ready',
      'Under Review': 'status-review',
      'Review Completed': 'status-completed'
    }

    return (
      <span className={`status-badge ${statusClasses[status as keyof typeof statusClasses] || 'status-default'}`}>
        {status}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="page-container">
        <main className="main-content">
          <div className="loading-state">
            <div className="spinner large"></div>
            <p>Loading contracts...</p>
          </div>
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-container">
        <main className="main-content">
          <div className="error-state">
            <p>Error: {error}</p>
            <button onClick={fetchContracts} className="retry-button">
              Try Again
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="page-container">
      <main className="main-content">
        <div className="review-header">
          <h1>Review & Redline</h1>
          <p>Interactive contract review with comments, revisions, and section management</p>
        </div>

        {!selectedContract ? (
          <div className="contract-selection">
            <h2>Select a Contract to Review</h2>
            {contracts.length === 0 ? (
              <div className="empty-state">
                <p>No contracts available for review. Please ensure contracts are ingested and analyzed.</p>
                <Link href="/contracts" className="primary-button">
                  View All Contracts
                </Link>
              </div>
            ) : (
              <div className="contracts-table-container">
                <table className="contracts-table">
                  <thead>
                    <tr>
                      <th>Contract Name</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((contract) => (
                      <tr key={contract.id} className="contract-row" onClick={() => handleContractSelect(contract)}>
                        <td className="contract-name">
                          <div className="file-info">
                            {getFileIcon(contract.filetype)}
                            <span className="filename">{contract.filename}</span>
                          </div>
                        </td>
                        <td className="contract-status">
                          {getStatusBadge(contract.status)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="review-workspace">
            <div className="workspace-header">
              <div className="contract-info">
                <h2>{selectedContract.filename}</h2>
                {getStatusBadge(selectedContract.status)}
              </div>
              <div className="workspace-actions">
                <button onClick={() => setSelectedContract(null)} className="back-button">
                  Select Different Contract
                </button>
              </div>
            </div>

            <div ref={workspaceRef} className="workspace-content" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 350px', gap: '16px', height: 'calc(100vh - 200px)', width: '100%' }}>
              <div className="contract-viewer" style={{ flex: 1, minWidth: 0 }}>
                {selectedContract.section_tree ? (
                  <ContractSectionTree
                    section={selectedContract.section_tree}
                    annotations={selectedContract.annotations}
                    onCommentCreate={handleCommentCreate}
                    onCommentEdit={handleCommentEdit}
                    onRevisionCreate={handleRevisionCreate}
                    onRevisionEdit={handleRevisionEdit}
                    selectedComment={selectedComment}
                    onCommentSelect={setSelectedComment}
                    selectedRevision={selectedRevision}
                    onRevisionSelect={(rev) => { setSelectedRevision(rev) }}
                  />
                ) : (
                  <p>No section tree available for this contract.</p>
                )}
              </div>

              {/* Comments Sidebar - Right Side */}
              <div className="comments-sidebar" style={{
                width: '350px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                overflow: 'hidden'
              }}>
                {/* Comments panel */}
                <div style={{ display: 'flex', flexDirection: 'column', height: '50%', minHeight: 0 }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600' }}>
                    Comments ({selectedContract.annotations?.comments?.length || 0})
                  </h3>
                  <div className="comments-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
                    {selectedContract.annotations?.comments?.length ? (
                      selectedContract.annotations.comments
                        .slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                        .map((comment) => (
                          <div
                            key={comment.id}
                            className={`comment-item ${selectedComment?.id === comment.id ? 'selected' : ''}`}
                            data-comment-id={comment.id}
                            style={{ padding: '12px', backgroundColor: selectedComment?.id === comment.id ? '#dbeafe' : '#ffffff', border: '1px solid #e5e7eb', borderRadius: '6px', transition: 'all 0.2s', position: 'relative' }}
                            onClick={() => {
                              setSelectedComment(comment)
                              const el = document.querySelector(`.comments-sidebar .comment-item[data-comment-id="${comment.id}"]`)
                              el && (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                            }}
                          >
                            {selectedComment?.id === comment.id && (
                              <div style={{ position: 'absolute', left: '-8px', top: '50%', transform: 'translateY(-50%)', width: '4px', height: '20px', backgroundColor: '#3b82f6', borderRadius: '2px' }} />
                            )}
                            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>Section {comment.node_id}</span>
                              <span>{new Date(comment.created_at).toLocaleDateString()}</span>
                            </div>
                            {editingComment?.id === comment.id ? (
                              <div>
                                <textarea value={editingText} onChange={(e) => setEditingText(e.target.value)} style={{ width: '100%', minHeight: '60px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', resize: 'vertical', fontFamily: 'inherit', marginBottom: '8px' }} ref={(el) => { if (el) { el.focus() } }} />
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                  <button onClick={handleEditCommentCancel} style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#ffffff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                                  <button onClick={() => { const newText = editingText.trim(); if (newText && newText !== comment.comment_text) { handleEditCommentSubmit(newText) } else { handleEditCommentCancel() } }} style={{ padding: '4px 8px', border: 'none', borderRadius: '4px', backgroundColor: '#3b82f6', color: '#ffffff', fontSize: '12px', cursor: 'pointer' }}>Save</button>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div style={{ fontSize: '14px', color: '#374151', marginBottom: '8px' }}>{comment.comment_text}</div>
                                <button onClick={() => handleEditCommentClick(comment)} style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#ffffff', color: '#6b7280', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6' }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff' }}>Edit Comment</button>
                              </div>
                            )}
                          </div>
                        ))
                    ) : (
                      <p style={{ color: '#6b7280', fontSize: '14px', fontStyle: 'italic' }}>No comments yet. Select text in the contract to add a comment.</p>
                    )}
                  </div>
                </div>

                {/* Revisions panel */}
                <div style={{ display: 'flex', flexDirection: 'column', height: '50%', minHeight: 0 }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600' }}>
                    Revisions ({selectedContract.annotations?.revisions?.length || 0})
                  </h3>
                  <div className="revisions-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
                    {selectedContract.annotations?.revisions?.length ? (
                      selectedContract.annotations.revisions
                        .slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                        .map((rev) => (
                          <div key={rev.id} className="revision-item" style={{ padding: '12px', backgroundColor: selectedRevision?.id === rev.id ? '#dbeafe' : '#ffffff', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer' }} onClick={(e) => {
                            const target = e.target as HTMLElement
                            if (target.closest('button, textarea')) return
                            setSelectedRevision(rev)
                          }}>
                            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>Section {rev.node_id}</span>
                              <span>{new Date(rev.created_at).toLocaleDateString()}</span>
                            </div>
                            <div style={{ fontSize: '14px', color: '#dc2626', marginBottom: '8px' }}>{rev.new_text}</div>
                            {editingRevision?.id === rev.id ? (
                              <div>
                                <textarea value={editingRevisionText} onChange={(e) => setEditingRevisionText(e.target.value)} onClick={(e) => e.stopPropagation()} style={{ width: '100%', minHeight: '60px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', resize: 'vertical', fontFamily: 'inherit', marginBottom: '8px' }} />
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                  <button onClick={(e) => { e.stopPropagation(); setEditingRevision(null); setEditingRevisionText('') }} style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#ffffff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                                  <button onClick={(e) => { e.stopPropagation(); const t = editingRevisionText.trim(); if (t && t !== rev.new_text) { handleRevisionEdit(rev.id, t) } else { setEditingRevision(null); setEditingRevisionText('') } }} style={{ padding: '4px 8px', border: 'none', borderRadius: '4px', backgroundColor: '#3b82f6', color: '#ffffff', fontSize: '12px', cursor: 'pointer' }}>Save</button>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => { setEditingRevision(rev); setEditingRevisionText(rev.new_text) }} style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#ffffff', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>Edit Revision</button>
                            )}
                          </div>
                        ))
                    ) : (
                      <p style={{ color: '#6b7280', fontSize: '14px', fontStyle: 'italic' }}>No revisions yet. Select text and choose Suggest Revision.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Connector overlay */}
              {connector && (
                <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  <line x1={connector.x1} y1={connector.y1} x2={connector.x2} y2={connector.y2} stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default ReviewPage
