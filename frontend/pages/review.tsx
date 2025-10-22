import { NextPage } from 'next'
import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useNotificationContext } from '../components/common/NotificationProvider'
import ContractSectionTree from '../components/ContractSectionTree'
import { CommentsPanel } from '../components/review/CommentsPanel'
import { RevisionsPanel } from '../components/review/RevisionsPanel'
import { SectionAddsPanel } from '../components/review/SectionAddsPanel'
import { SectionRemovesPanel } from '../components/review/SectionRemovesPanel'
import { ChangelogPanel } from '../components/review/ChangelogPanel'
import { AgentChatTab } from '../components/contracts/AgentChatTab'
import { ContractWithAnnotations, ContractAnnotations, CommentAnnotation, RevisionAnnotation } from '../lib/types/annotation'
import { performContractAction, resolveAnnotation, deleteAnnotation } from '../lib/api/annotations'
import { fetchContracts } from '../lib/api'
import { getFileIcon, getStatusBadge } from '../lib/utils'
import { Spinner } from '../components/common/Spinner'

const ReviewPage: NextPage = () => {
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const [connector, setConnector] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null)
  const [contracts, setContracts] = useState<ContractWithAnnotations[]>([])
  const [selectedContract, setSelectedContract] = useState<ContractWithAnnotations | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedComment, setSelectedComment] = useState<CommentAnnotation | null>(null)
  const [selectedRevision, setSelectedRevision] = useState<RevisionAnnotation | null>(null)
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)
  const [resolvingCommentId, setResolvingCommentId] = useState<string | null>(null)
  const [deletingRevisionId, setDeletingRevisionId] = useState<string | null>(null)
  const [resolvingRevisionId, setResolvingRevisionId] = useState<string | null>(null)
  const [deletingSectionAddId, setDeletingSectionAddId] = useState<string | null>(null)
  const [resolvingSectionAddId, setResolvingSectionAddId] = useState<string | null>(null)
  const [deletingSectionRemoveId, setDeletingSectionRemoveId] = useState<string | null>(null)
  const [resolvingSectionRemoveId, setResolvingSectionRemoveId] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [showAgentChat, setShowAgentChat] = useState(true)
  const [showAnnotations, setShowAnnotations] = useState(true)
  const { isConnected } = useNotificationContext()

  useEffect(() => {
    loadContracts()
  }, [])

  const loadContracts = async () => {
    try {
      setLoading(true)
      const data = await fetchContracts()
      const reviewableContracts = data.filter((contract: any) =>
        contract.status === 'Ready for Review' || contract.status === 'Under Review' || contract.status === 'Review Completed'
      ) as ContractWithAnnotations[]
      setContracts(reviewableContracts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const refreshSelectedContract = async () => {
    if (!selectedContract) return
    try {
      const data = await fetchContracts()
      const updatedContract = data.find((contract: any) => contract.id === selectedContract.id) as ContractWithAnnotations
      if (updatedContract) {
        setSelectedContract(updatedContract)
        // Also update the contract in the contracts list
        setContracts(prev => prev.map(contract => 
          contract.id === selectedContract.id ? updatedContract : contract
        ))
      }
    } catch (err) {
      console.error('Failed to refresh contract:', err)
    }
  }

  const mergeById = <T extends { id: string }>(current: T[] = [], updates: T[] = []): T[] => {
    if (!updates || updates.length === 0) return current || []
    const map = new Map(current?.map(item => [item.id, item]))
    updates.forEach(u => map.set(u.id, u))
    return Array.from(map.values())
  }

  const mergeAnnotations = (current?: ContractAnnotations, updates?: ContractAnnotations): ContractAnnotations => {
    const base: ContractAnnotations = { comments: current?.comments || [], revisions: current?.revisions || [], section_adds: current?.section_adds || [], section_removes: current?.section_removes || [] }
    if (!updates) return base
    return {
      comments: mergeById(base.comments, updates.comments || []),
      revisions: mergeById(base.revisions, updates.revisions || []),
      section_adds: mergeById(base.section_adds as any[], (updates.section_adds || []) as any[]) as any,
      section_removes: mergeById(base.section_removes as any[], (updates.section_removes || []) as any[]) as any,
    }
  }

  const updateSectionTreeNodes = (sectionTree: any, updatedNodes: any[]): any => {
    if (!updatedNodes || updatedNodes.length === 0) return sectionTree
    const updatedNodesMap = new Map(updatedNodes.map(node => [node.id, node]))
    const updateNode = (node: any): any => {
      if (updatedNodesMap.has(node.id)) return updatedNodesMap.get(node.id)
      if (node.children && node.children.length > 0) return { ...node, children: node.children.map(updateNode) }
      return node
    }
    return updateNode(sectionTree)
  }

  const handleCommentCreate = async (nodeId: string, offsetBeg: number, offsetEnd: number, anchorText: string, commentText: string) => {
    if (!selectedContract) return
    try {
      const response = await performContractAction(selectedContract.id, { action: 'make_comment', data: { node_id: nodeId, offset_beg: offsetBeg, offset_end: offsetEnd, anchor_text: anchorText, comment_text: commentText } })
      setSelectedContract(prev => prev ? { ...prev, annotations: mergeAnnotations(prev.annotations, response.updated_annotations) } : null)
      const newComment = response.updated_annotations?.comments?.[0]
      if (newComment) setSelectedComment(newComment)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create comment')
    }
  }

  const handleCommentEdit = async (annotationId: string, commentText: string) => {
    if (!selectedContract) return
    try {
      const response = await performContractAction(selectedContract.id, { action: 'edit_comment', data: { annotation_id: annotationId, comment_text: commentText } })
      setSelectedContract(prev => prev ? { ...prev, annotations: mergeAnnotations(prev.annotations, response.updated_annotations) } : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to edit comment')
    }
  }

  const handleRevisionCreate = async (nodeId: string, offsetBeg: number, offsetEnd: number, oldText: string, newText: string) => {
    if (!selectedContract) return
    try {
      const response = await performContractAction(selectedContract.id, { action: 'make_revision', data: { node_id: nodeId, offset_beg: offsetBeg, offset_end: offsetEnd, old_text: oldText, new_text: newText } })
      setSelectedContract(prev => prev ? { ...prev, annotations: mergeAnnotations(prev.annotations, response.updated_annotations) } : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create revision')
    }
  }

  const handleRevisionEdit = async (annotationId: string, newText: string) => {
    if (!selectedContract) return
    try {
      const response = await performContractAction(selectedContract.id, { action: 'edit_revision', data: { annotation_id: annotationId, new_text: newText } })
      setSelectedContract(prev => prev ? { ...prev, annotations: mergeAnnotations(prev.annotations, response.updated_annotations) } : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to edit revision')
    }
  }

  const handleCommentResolve = async (annotationId: string) => {
    if (!selectedContract || resolvingCommentId === annotationId) return
    setResolvingCommentId(annotationId)
    try {
      const result = await resolveAnnotation(selectedContract.id, { annotation_id: annotationId, annotation_type: 'comment', resolution: 'resolved' })
      setSelectedContract(prev => prev ? { ...prev, annotations: mergeAnnotations(prev.annotations, result.updated_annotations) } : null)
      if (selectedComment?.id === annotationId) setSelectedComment(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve comment')
    } finally {
      setResolvingCommentId(null)
    }
  }

  const handleCommentDelete = async (annotationId: string) => {
    if (!selectedContract || deletingCommentId === annotationId) return
    setDeletingCommentId(annotationId)
    try {
      await deleteAnnotation(selectedContract.id, annotationId)
      setSelectedContract(prev => {
        if (!prev) return null
        const updatedAnnotations = { comments: prev.annotations?.comments || [], revisions: prev.annotations?.revisions || [], section_adds: prev.annotations?.section_adds || [], section_removes: prev.annotations?.section_removes || [] }
        updatedAnnotations.comments = updatedAnnotations.comments.filter(comment => comment.id !== annotationId)
        return { ...prev, annotations: updatedAnnotations }
      })
      if (selectedComment?.id === annotationId) setSelectedComment(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete comment')
    } finally {
      setDeletingCommentId(null)
    }
  }

  const handleRevisionResolve = async (annotationId: string, resolution: 'accepted' | 'rejected') => {
    if (!selectedContract || resolvingRevisionId === annotationId) return
    setResolvingRevisionId(annotationId)
    try {
      const result = await resolveAnnotation(selectedContract.id, { annotation_id: annotationId, annotation_type: 'revision', resolution })
      setSelectedContract(prev => {
        if (!prev) return null
        let updatedContract = { ...prev, annotations: mergeAnnotations(prev.annotations, result.updated_annotations) }
        if (result.updated_nodes && result.updated_nodes.length > 0) {
          updatedContract = { ...updatedContract, section_tree: updateSectionTreeNodes(prev.section_tree, result.updated_nodes) }
        }
        return updatedContract
      })
      if (selectedRevision?.id === annotationId) setSelectedRevision(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve revision')
    } finally {
      setResolvingRevisionId(null)
    }
  }

  const handleRevisionDelete = async (annotationId: string) => {
    if (!selectedContract || deletingRevisionId === annotationId) return
    setDeletingRevisionId(annotationId)
    try {
      await deleteAnnotation(selectedContract.id, annotationId)
      setSelectedContract(prev => {
        if (!prev) return null
        const updatedAnnotations = { comments: prev.annotations?.comments || [], revisions: prev.annotations?.revisions || [], section_adds: prev.annotations?.section_adds || [], section_removes: prev.annotations?.section_removes || [] }
        updatedAnnotations.revisions = updatedAnnotations.revisions.filter(revision => revision.id !== annotationId)
        return { ...prev, annotations: updatedAnnotations }
      })
      if (selectedRevision?.id === annotationId) setSelectedRevision(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete revision')
    } finally {
      setDeletingRevisionId(null)
    }
  }

  const handleSectionAdd = async (targetParentId: string, insertionIndex: number, newSectionNode: any) => {
    if (!selectedContract) return
    try {
      const response = await performContractAction(selectedContract.id, { action: 'section_add', data: { target_parent_id: targetParentId, insertion_index: insertionIndex, new_node: newSectionNode } })
      setSelectedContract(prev => prev ? { ...prev, annotations: mergeAnnotations(prev.annotations, response.updated_annotations) } : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add section')
    }
  }

  const handleSectionRemove = async (targetNodeId: string) => {
    if (!selectedContract) return
    try {
      const response = await performContractAction(selectedContract.id, { action: 'section_remove', data: { node_id: targetNodeId } })
      setSelectedContract(prev => prev ? { ...prev, annotations: mergeAnnotations(prev.annotations, response.updated_annotations) } : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove section')
    }
  }

  const handleSectionAddResolve = async (annotationId: string, resolution: 'accepted' | 'rejected') => {
    if (!selectedContract || resolvingSectionAddId === annotationId) return
    setResolvingSectionAddId(annotationId)
    try {
      const result = await resolveAnnotation(selectedContract.id, { annotation_id: annotationId, annotation_type: 'section_add', resolution })
      setSelectedContract(prev => {
        if (!prev) return null
        let updatedContract = { ...prev, annotations: mergeAnnotations(prev.annotations, result.updated_annotations) }
        if (result.updated_nodes && result.updated_nodes.length > 0) {
          updatedContract = { ...updatedContract, section_tree: updateSectionTreeNodes(prev.section_tree, result.updated_nodes) }
        }
        return updatedContract
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve section addition')
    } finally {
      setResolvingSectionAddId(null)
    }
  }

  const handleSectionAddDelete = async (annotationId: string) => {
    if (!selectedContract || deletingSectionAddId === annotationId) return
    setDeletingSectionAddId(annotationId)
    try {
      await deleteAnnotation(selectedContract.id, annotationId)
      setSelectedContract(prev => {
        if (!prev) return null
        const updatedAnnotations = { comments: prev.annotations?.comments || [], revisions: prev.annotations?.revisions || [], section_adds: prev.annotations?.section_adds || [], section_removes: prev.annotations?.section_removes || [] }
        updatedAnnotations.section_adds = updatedAnnotations.section_adds.filter(sectionAdd => sectionAdd.id !== annotationId)
        return { ...prev, annotations: updatedAnnotations }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete section addition')
    } finally {
      setDeletingSectionAddId(null)
    }
  }

  const handleSectionRemoveResolve = async (annotationId: string, resolution: 'accepted' | 'rejected') => {
    if (!selectedContract || resolvingSectionRemoveId === annotationId) return
    setResolvingSectionRemoveId(annotationId)
    try {
      const result = await resolveAnnotation(selectedContract.id, { annotation_id: annotationId, annotation_type: 'section_remove', resolution })
      setSelectedContract(prev => {
        if (!prev) return null
        let updatedContract = { ...prev, annotations: mergeAnnotations(prev.annotations, result.updated_annotations) }
        if (result.updated_nodes && result.updated_nodes.length > 0) {
          updatedContract = { ...updatedContract, section_tree: updateSectionTreeNodes(prev.section_tree, result.updated_nodes) }
        }
        return updatedContract
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve section removal')
    } finally {
      setResolvingSectionRemoveId(null)
    }
  }

  const handleSectionRemoveDelete = async (annotationId: string) => {
    if (!selectedContract || deletingSectionRemoveId === annotationId) return
    setDeletingSectionRemoveId(annotationId)
    try {
      await deleteAnnotation(selectedContract.id, annotationId)
      setSelectedContract(prev => {
        if (!prev) return null
        const updatedAnnotations = { comments: prev.annotations?.comments || [], revisions: prev.annotations?.revisions || [], section_adds: prev.annotations?.section_adds || [], section_removes: prev.annotations?.section_removes || [] }
        updatedAnnotations.section_removes = updatedAnnotations.section_removes.filter(sectionRemove => sectionRemove.id !== annotationId)
        return { ...prev, annotations: updatedAnnotations }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete section removal')
    } finally {
      setDeletingSectionRemoveId(null)
    }
  }

  const toggleGroupCollapse = (groupName: string) => {
    setCollapsedGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(groupName)) newSet.delete(groupName)
      else newSet.add(groupName)
      return newSet
    })
  }

  const getGroupHeight = (groupName: string) => {
    const isCollapsed = collapsedGroups.has(groupName)
    if (isCollapsed) return 'auto'

    // Count non-collapsed groups
    const totalGroups = 5 // Comments, Revisions, Added Sections, Removed Sections, Changelog
    const expandedCount = totalGroups - collapsedGroups.size

    if (expandedCount === 0) return 'auto'

    // Calculate height percentage for each expanded group
    const heightPercent = 100 / expandedCount
    return `${heightPercent}%`
  }

  const getGridTemplateColumns = () => {
    if (showAgentChat && showAnnotations) {
      return '30% 40% 30%'
    } else if (showAgentChat && !showAnnotations) {
      return '30% 70%'
    } else if (!showAgentChat && showAnnotations) {
      return '70% 30%'
    } else {
      return '1fr'
    }
  }

  if (loading) {
    return (
      <div className="page-container">
        <main className="main-content">
          <div className="loading-state">
            <Spinner size="large" />
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
            <button onClick={loadContracts} className="retry-button">Try Again</button>
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
                <Link href="/contracts" className="primary-button">View All Contracts</Link>
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
                      <tr key={contract.id} className="contract-row" onClick={() => { setSelectedContract(contract); setSelectedComment(null) }}>
                        <td className="contract-name">
                          <div className="file-info">
                            {getFileIcon(contract.filetype)}
                            <span className="filename">{contract.filename}</span>
                          </div>
                        </td>
                        <td className="contract-status">{getStatusBadge(contract.status)}</td>
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
                {!showAgentChat && (
                  <button onClick={() => setShowAgentChat(true)} className="cta-button secondary" style={{ marginRight: '8px' }}>
                    Show Agent Chat
                  </button>
                )}
                {!showAnnotations && (
                  <button onClick={() => setShowAnnotations(true)} className="cta-button secondary" style={{ marginRight: '8px' }}>
                    Show Contract Annotations
                  </button>
                )}
                <button onClick={() => setSelectedContract(null)} className="back-button">Select Different Contract</button>
              </div>
            </div>

            <div ref={workspaceRef} className="workspace-content" style={{ position: 'relative', display: 'grid', gridTemplateColumns: getGridTemplateColumns(), gap: '20px', height: 'calc(100vh - 120px)', width: '100%', maxWidth: 'none' }}>
              {showAgentChat && (
                <div className="agent-chat-panel" style={{ width: '100%', backgroundColor: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div className="panel-header" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '16px' }}>
                    <button 
                      onClick={() => setShowAgentChat(false)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#6b7280' }}
                      title="Hide Agent Chat"
                    >
                      ×
                    </button>
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <AgentChatTab
                      contract={selectedContract}
                      contractId={selectedContract.id}
                      isAnalyzing={false}
                      onIngest={() => {}}
                      navigateToPage={() => {}}
                      onRunCompleted={refreshSelectedContract}
                    />
                  </div>
                </div>
              )}
              <div className="contract-viewer" style={{ flex: 1, minWidth: 0 }}>
                {selectedContract.section_tree ? (
                  <ContractSectionTree
                    section={selectedContract.section_tree}
                    annotations={selectedContract.annotations}
                    onCommentCreate={handleCommentCreate}
                    onCommentEdit={handleCommentEdit}
                    onRevisionCreate={handleRevisionCreate}
                    onRevisionEdit={handleRevisionEdit}
                    onSectionAdd={handleSectionAdd}
                    onSectionRemove={handleSectionRemove}
                    selectedComment={selectedComment}
                    onCommentSelect={setSelectedComment}
                    selectedRevision={selectedRevision}
                    onRevisionSelect={(rev: RevisionAnnotation | null) => { setSelectedRevision(rev) }}
                  />
                ) : (
                  <p>No section tree available for this contract.</p>
                )}
              </div>

              {showAnnotations && (
                <div className="comments-sidebar" style={{ width: '100%', backgroundColor: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'hidden' }}>
                  <div className="panel-header" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '16px' }}>
                    <button 
                      onClick={() => setShowAnnotations(false)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#6b7280' }}
                      title="Hide Contract Annotations"
                    >
                      ×
                    </button>
                  </div>
                <CommentsPanel
                  comments={selectedContract.annotations?.comments || []}
                  selectedComment={selectedComment}
                  onCommentSelect={setSelectedComment}
                  onCommentEdit={handleCommentEdit}
                  onCommentResolve={handleCommentResolve}
                  onCommentDelete={handleCommentDelete}
                  resolvingCommentId={resolvingCommentId}
                  deletingCommentId={deletingCommentId}
                  isCollapsed={collapsedGroups.has('comments')}
                  onToggleCollapse={() => toggleGroupCollapse('comments')}
                  height={getGroupHeight('comments')}
                />

                <RevisionsPanel
                  revisions={selectedContract.annotations?.revisions || []}
                  selectedRevision={selectedRevision}
                  onRevisionSelect={setSelectedRevision}
                  onRevisionEdit={handleRevisionEdit}
                  onRevisionResolve={handleRevisionResolve}
                  onRevisionDelete={handleRevisionDelete}
                  resolvingRevisionId={resolvingRevisionId}
                  deletingRevisionId={deletingRevisionId}
                  isCollapsed={collapsedGroups.has('revisions')}
                  onToggleCollapse={() => toggleGroupCollapse('revisions')}
                  height={getGroupHeight('revisions')}
                />

                <SectionAddsPanel
                  sectionAdds={selectedContract.annotations?.section_adds || []}
                  onSectionAddResolve={handleSectionAddResolve}
                  onSectionAddDelete={handleSectionAddDelete}
                  resolvingSectionAddId={resolvingSectionAddId}
                  deletingSectionAddId={deletingSectionAddId}
                  isCollapsed={collapsedGroups.has('section_adds')}
                  onToggleCollapse={() => toggleGroupCollapse('section_adds')}
                  height={getGroupHeight('section_adds')}
                />

                <SectionRemovesPanel
                  sectionRemoves={selectedContract.annotations?.section_removes || []}
                  onSectionRemoveResolve={handleSectionRemoveResolve}
                  onSectionRemoveDelete={handleSectionRemoveDelete}
                  resolvingSectionRemoveId={resolvingSectionRemoveId}
                  deletingSectionRemoveId={deletingSectionRemoveId}
                  isCollapsed={collapsedGroups.has('section_removes')}
                  onToggleCollapse={() => toggleGroupCollapse('section_removes')}
                  height={getGroupHeight('section_removes')}
                />

                <ChangelogPanel
                  comments={selectedContract.annotations?.comments || []}
                  revisions={selectedContract.annotations?.revisions || []}
                  sectionAdds={selectedContract.annotations?.section_adds || []}
                  sectionRemoves={selectedContract.annotations?.section_removes || []}
                  isCollapsed={collapsedGroups.has('changelog')}
                  onToggleCollapse={() => toggleGroupCollapse('changelog')}
                  height={getGroupHeight('changelog')}
                />
                </div>
              )}

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
