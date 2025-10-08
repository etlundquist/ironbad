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

interface SectionAddAnnotation {
  id: string
  target_parent_id: string
  insertion_index: number
  new_node: any
  status: string
  created_at: string
  resolved_at?: string
}

interface SectionRemoveAnnotation {
  id: string
  node_id: string
  status: string
  created_at: string
  resolved_at?: string
}

interface ContractAnnotations {
  comments: CommentAnnotation[]
  revisions: RevisionAnnotation[]
  section_adds: SectionAddAnnotation[]
  section_removes: SectionRemoveAnnotation[]
}

interface SectionAddRequest {
  target_parent_id: string
  insertion_index: number
  new_node: any
}

interface SectionRemoveRequest {
  node_id: string
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

interface AnnotationResolutionRequest {
  annotation_id: string
  annotation_type: 'comment' | 'revision' | 'section_add' | 'section_remove'
  resolution: 'accepted' | 'rejected' | 'resolved'
}

interface AnnotationResolutionResponse {
  status: 'applied' | 'rejected' | 'conflict'
  annotation_id: string
  annotation_type: string
  resolution: string
  new_contract_version: number
  updated_annotations: ContractAnnotations
  updated_nodes?: any[]
  rebased_annotations?: ContractAnnotations
}

interface AnnotationDeleteResponse {
  status: 'applied' | 'rejected' | 'conflict'
  annotation_id: string
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
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)
  const [resolvingCommentId, setResolvingCommentId] = useState<string | null>(null)
  const [deletingRevisionId, setDeletingRevisionId] = useState<string | null>(null)
  const [resolvingRevisionId, setResolvingRevisionId] = useState<string | null>(null)
  const [deletingSectionAddId, setDeletingSectionAddId] = useState<string | null>(null)
  const [resolvingSectionAddId, setResolvingSectionAddId] = useState<string | null>(null)
  const [deletingSectionRemoveId, setDeletingSectionRemoveId] = useState<string | null>(null)
  const [resolvingSectionRemoveId, setResolvingSectionRemoveId] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
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

  const updateSectionTreeNodes = (sectionTree: any, updatedNodes: any[]): any => {
    if (!updatedNodes || updatedNodes.length === 0) return sectionTree

    // Create a map of updated nodes by ID
    const updatedNodesMap = new Map(updatedNodes.map(node => [node.id, node]))

    // Recursively update the section tree
    const updateNode = (node: any): any => {
      if (updatedNodesMap.has(node.id)) {
        // Replace this node with the updated version
        return updatedNodesMap.get(node.id)
      }

      // Recursively update children
      if (node.children && node.children.length > 0) {
        return {
          ...node,
          children: node.children.map(updateNode)
        }
      }

      return node
    }

    return updateNode(sectionTree)
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

  const handleCommentResolve = async (annotationId: string) => {
    if (!selectedContract || resolvingCommentId === annotationId) return

    setResolvingCommentId(annotationId)
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const request: AnnotationResolutionRequest = {
        annotation_id: annotationId,
        annotation_type: 'comment',
        resolution: 'resolved'
      }

      const response = await fetch(`${backendUrl}/contracts/${selectedContract.id}/annotations/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to resolve comment')
      }

      const result: AnnotationResolutionResponse = await response.json()

      // Merge updated annotations from backend into current state
      setSelectedContract(prev => prev ? {
        ...prev,
        annotations: mergeAnnotations(prev.annotations, result.updated_annotations)
      } : null)

      // Clear selected comment if it was resolved
      if (selectedComment?.id === annotationId) {
        setSelectedComment(null)
      }
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
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(`${backendUrl}/contracts/${selectedContract.id}/annotations/${annotationId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to delete comment')
      }

      const result: AnnotationDeleteResponse = await response.json()

      // Remove the deleted comment from the local state immediately
      setSelectedContract(prev => {
        if (!prev) return null

        const updatedAnnotations = {
          comments: prev.annotations?.comments || [],
          revisions: prev.annotations?.revisions || [],
          section_adds: prev.annotations?.section_adds || [],
          section_removes: prev.annotations?.section_removes || []
        }
        updatedAnnotations.comments = updatedAnnotations.comments.filter(comment => comment.id !== annotationId)

        return {
          ...prev,
          annotations: updatedAnnotations
        }
      })

      // Clear selected comment if it was deleted
      if (selectedComment?.id === annotationId) {
        setSelectedComment(null)
      }
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
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const request: AnnotationResolutionRequest = {
        annotation_id: annotationId,
        annotation_type: 'revision',
        resolution: resolution
      }

      const response = await fetch(`${backendUrl}/contracts/${selectedContract.id}/annotations/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to resolve revision')
      }

      const result: AnnotationResolutionResponse = await response.json()

      // Merge updated annotations and nodes from backend into current state
      setSelectedContract(prev => {
        if (!prev) return null

        let updatedContract = {
          ...prev,
          annotations: mergeAnnotations(prev.annotations, result.updated_annotations)
        }

        // Update section tree nodes if they were modified
        if (result.updated_nodes && result.updated_nodes.length > 0) {
          updatedContract = {
            ...updatedContract,
            section_tree: updateSectionTreeNodes(prev.section_tree, result.updated_nodes)
          }
        }

        return updatedContract
      })

      // Clear selected revision if it was resolved
      if (selectedRevision?.id === annotationId) {
        setSelectedRevision(null)
      }
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
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(`${backendUrl}/contracts/${selectedContract.id}/annotations/${annotationId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to delete revision')
      }

      const result: AnnotationDeleteResponse = await response.json()

      // Remove the deleted revision from the local state immediately
      setSelectedContract(prev => {
        if (!prev) return null

        const updatedAnnotations = {
          comments: prev.annotations?.comments || [],
          revisions: prev.annotations?.revisions || [],
          section_adds: prev.annotations?.section_adds || [],
          section_removes: prev.annotations?.section_removes || []
        }
        updatedAnnotations.revisions = updatedAnnotations.revisions.filter(revision => revision.id !== annotationId)

        return {
          ...prev,
          annotations: updatedAnnotations
        }
      })

      // Clear selected revision if it was deleted
      if (selectedRevision?.id === annotationId) {
        setSelectedRevision(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete revision')
    } finally {
      setDeletingRevisionId(null)
    }
  }

  const handleSectionAddResolve = async (annotationId: string, resolution: 'accepted' | 'rejected') => {
    if (!selectedContract || resolvingSectionAddId === annotationId) return

    setResolvingSectionAddId(annotationId)
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const request: AnnotationResolutionRequest = {
        annotation_id: annotationId,
        annotation_type: 'section_add',
        resolution: resolution
      }

      const response = await fetch(`${backendUrl}/contracts/${selectedContract.id}/annotations/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to resolve section addition')
      }

      const result: AnnotationResolutionResponse = await response.json()

      // Merge updated annotations and nodes from backend into current state
      setSelectedContract(prev => {
        if (!prev) return null

        let updatedContract = {
          ...prev,
          annotations: mergeAnnotations(prev.annotations, result.updated_annotations)
        }

        // Update section tree nodes if they were modified
        if (result.updated_nodes && result.updated_nodes.length > 0) {
          updatedContract = {
            ...updatedContract,
            section_tree: updateSectionTreeNodes(prev.section_tree, result.updated_nodes)
          }
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
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(`${backendUrl}/contracts/${selectedContract.id}/annotations/${annotationId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to delete section addition')
      }

      const result: AnnotationDeleteResponse = await response.json()

      // Remove the deleted section addition from the local state immediately
      setSelectedContract(prev => {
        if (!prev) return null

        const updatedAnnotations = {
          comments: prev.annotations?.comments || [],
          revisions: prev.annotations?.revisions || [],
          section_adds: prev.annotations?.section_adds || [],
          section_removes: prev.annotations?.section_removes || []
        }
        updatedAnnotations.section_adds = updatedAnnotations.section_adds.filter(sectionAdd => sectionAdd.id !== annotationId)

        return {
          ...prev,
          annotations: updatedAnnotations
        }
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
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const request: AnnotationResolutionRequest = {
        annotation_id: annotationId,
        annotation_type: 'section_remove',
        resolution: resolution
      }

      const response = await fetch(`${backendUrl}/contracts/${selectedContract.id}/annotations/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to resolve section removal')
      }

      const result: AnnotationResolutionResponse = await response.json()

      // Merge updated annotations and nodes from backend into current state
      setSelectedContract(prev => {
        if (!prev) return null

        let updatedContract = {
          ...prev,
          annotations: mergeAnnotations(prev.annotations, result.updated_annotations)
        }

        // Update section tree nodes if they were modified
        if (result.updated_nodes && result.updated_nodes.length > 0) {
          updatedContract = {
            ...updatedContract,
            section_tree: updateSectionTreeNodes(prev.section_tree, result.updated_nodes)
          }
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
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(`${backendUrl}/contracts/${selectedContract.id}/annotations/${annotationId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to delete section removal')
      }

      const result: AnnotationDeleteResponse = await response.json()

      // Remove the deleted section removal from the local state immediately
      setSelectedContract(prev => {
        if (!prev) return null

        const updatedAnnotations = {
          comments: prev.annotations?.comments || [],
          revisions: prev.annotations?.revisions || [],
          section_adds: prev.annotations?.section_adds || [],
          section_removes: prev.annotations?.section_removes || []
        }
        updatedAnnotations.section_removes = updatedAnnotations.section_removes.filter(sectionRemove => sectionRemove.id !== annotationId)

        return {
          ...prev,
          annotations: updatedAnnotations
        }
      })

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete section removal')
    } finally {
      setDeletingSectionRemoveId(null)
    }
  }

  const handleSectionAdd = async (targetParentId: string, insertionIndex: number, newSectionNode: any) => {
    if (!selectedContract) return

    try {
      const action: ContractActionRequest = {
        action: 'section_add',
        data: {
          target_parent_id: targetParentId,
          insertion_index: insertionIndex,
          new_node: newSectionNode
        }
      }

      const response = await handleContractAction(selectedContract.id, action)

      // Merge updated annotations from backend into current state
      setSelectedContract(prev => prev ? {
        ...prev,
        annotations: mergeAnnotations(prev.annotations, response.updated_annotations)
      } : null)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add section')
    }
  }

  const handleSectionRemove = async (targetNodeId: string) => {
    if (!selectedContract) return

    try {
      const action: ContractActionRequest = {
        action: 'section_remove',
        data: {
          node_id: targetNodeId
        }
      }

      const response = await handleContractAction(selectedContract.id, action)

      // Merge updated annotations from backend into current state
      setSelectedContract(prev => prev ? {
        ...prev,
        annotations: mergeAnnotations(prev.annotations, response.updated_annotations)
      } : null)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove section')
    }
  }

  const toggleGroupCollapse = (groupName: string) => {
    setCollapsedGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(groupName)) {
        newSet.delete(groupName)
      } else {
        newSet.add(groupName)
      }
      return newSet
    })
  }

  const getGroupHeight = (groupName: string) => {
    const isCollapsed = collapsedGroups.has(groupName)
    if (isCollapsed) return 'auto'

    // Count non-collapsed groups
    const totalGroups = 4 // Comments, Revisions, Added Sections, Removed Sections
    const collapsedCount = collapsedGroups.size
    const visibleGroups = totalGroups - collapsedCount

    if (visibleGroups === 0) return 'auto'

    // Calculate height percentage for each visible group
    const heightPercent = 100 / visibleGroups
    return `${heightPercent}%`
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
              onSectionAdd={handleSectionAdd}
              onSectionRemove={handleSectionRemove}
              selectedComment={selectedComment}
              onCommentSelect={setSelectedComment}
              selectedRevision={selectedRevision}
              onRevisionSelect={(rev: RevisionAnnotation) => { setSelectedRevision(rev) }}
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
                <div style={{ display: 'flex', flexDirection: 'column', height: getGroupHeight('comments'), minHeight: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '12px',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                    onClick={() => toggleGroupCollapse('comments')}
                  >
                    <span style={{
                      fontSize: '14px',
                      color: '#6b7280',
                      transform: collapsedGroups.has('comments') ? 'rotate(0deg)' : 'rotate(90deg)',
                      transition: 'transform 0.2s'
                    }}>
                      ▶
                    </span>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                      Comments ({selectedContract.annotations?.comments?.length || 0})
                    </h3>
                  </div>
                  {!collapsedGroups.has('comments') && (
                    <div className="comments-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1 }}>
                      {selectedContract.annotations?.comments?.length ? (
                      selectedContract.annotations.comments
                        .slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                        .map((comment) => (
                          <div
                            key={comment.id}
                            className={`comment-item ${selectedComment?.id === comment.id ? 'selected' : ''}`}
                            data-comment-id={comment.id}
                            style={{
                              padding: '12px',
                              backgroundColor: comment.status === 'resolved'
                                ? '#f0fdf4'
                                : comment.status === 'conflict'
                                  ? '#fef3c7'
                                  : comment.status === 'stale'
                                    ? '#f3f4f6'
                                    : selectedComment?.id === comment.id
                                      ? '#dbeafe'
                                      : '#ffffff',
                              border: comment.status === 'resolved'
                                ? '1px solid #bbf7d0'
                                : comment.status === 'conflict'
                                  ? '1px solid #f59e0b'
                                  : comment.status === 'stale'
                                    ? '1px solid #9ca3af'
                                    : '1px solid #e5e7eb',
                              borderRadius: '6px',
                              transition: 'all 0.2s',
                              position: 'relative',
                              opacity: comment.status === 'resolved' || comment.status === 'conflict' || comment.status === 'stale' ? 0.8 : 1
                            }}
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
                                <div style={{
                                  fontSize: '14px',
                                  color: comment.status === 'resolved' ? '#6b7280' : comment.status === 'conflict' ? '#92400e' : comment.status === 'stale' ? '#6b7280' : '#374151',
                                  marginBottom: '8px',
                                  textDecoration: comment.status === 'resolved' || comment.status === 'stale' ? 'line-through' : 'none',
                                  opacity: comment.status === 'resolved' || comment.status === 'stale' ? 0.7 : 1
                                }}>
                                  {comment.comment_text}
                                </div>
                                {comment.status === 'resolved' ? (
                                  <div style={{
                                    fontSize: '12px',
                                    color: '#10b981',
                                    fontWeight: '500',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}>
                                    <span>✓</span>
                                    Resolved
                                  </div>
                                ) : comment.status === 'conflict' ? (
                                  <div style={{
                                    fontSize: '12px',
                                    color: '#f59e0b',
                                    fontWeight: '500',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}>
                                    <span>⚠</span>
                                    Conflict
                                  </div>
                                ) : comment.status === 'stale' ? (
                                  <div style={{
                                    fontSize: '12px',
                                    color: '#6b7280',
                                    fontWeight: '500',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}>
                                    <span>⏰</span>
                                    Stale
                                  </div>
                                ) : comment.status === 'conflict' || comment.status === 'stale' ? (
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleCommentDelete(comment.id)
                                      }}
                                      disabled={deletingCommentId === comment.id}
                                      style={{
                                        padding: '4px 8px',
                                        border: '1px solid #ef4444',
                                        borderRadius: '4px',
                                        backgroundColor: '#ffffff',
                                        color: deletingCommentId === comment.id ? '#9ca3af' : '#ef4444',
                                        fontSize: '12px',
                                        cursor: deletingCommentId === comment.id ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.2s',
                                        opacity: deletingCommentId === comment.id ? 0.6 : 1
                                      }}
                                      onMouseEnter={(e) => {
                                        if (deletingCommentId !== comment.id) {
                                          e.currentTarget.style.backgroundColor = '#fef2f2'
                                        }
                                      }}
                                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff' }}
                                    >
                                      {deletingCommentId === comment.id ? 'Deleting...' : 'Dismiss'}
                                    </button>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleEditCommentClick(comment)
                                      }}
                                      style={{
                                        padding: '4px 8px',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '4px',
                                        backgroundColor: '#ffffff',
                                        color: '#6b7280',
                                        fontSize: '12px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                      }}
                                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6' }}
                                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff' }}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleCommentResolve(comment.id)
                                      }}
                                      disabled={resolvingCommentId === comment.id}
                                      style={{
                                        padding: '4px 8px',
                                        border: '1px solid #10b981',
                                        borderRadius: '4px',
                                        backgroundColor: '#ffffff',
                                        color: resolvingCommentId === comment.id ? '#9ca3af' : '#10b981',
                                        fontSize: '12px',
                                        cursor: resolvingCommentId === comment.id ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.2s',
                                        opacity: resolvingCommentId === comment.id ? 0.6 : 1
                                      }}
                                      onMouseEnter={(e) => {
                                        if (resolvingCommentId !== comment.id) {
                                          e.currentTarget.style.backgroundColor = '#f0fdf4'
                                        }
                                      }}
                                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff' }}
                                    >
                                      {resolvingCommentId === comment.id ? 'Resolving...' : 'Resolve'}
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleCommentDelete(comment.id)
                                      }}
                                      disabled={deletingCommentId === comment.id}
                                      style={{
                                        padding: '4px 8px',
                                        border: '1px solid #ef4444',
                                        borderRadius: '4px',
                                        backgroundColor: '#ffffff',
                                        color: deletingCommentId === comment.id ? '#9ca3af' : '#ef4444',
                                        fontSize: '12px',
                                        cursor: deletingCommentId === comment.id ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.2s',
                                        opacity: deletingCommentId === comment.id ? 0.6 : 1
                                      }}
                                      onMouseEnter={(e) => {
                                        if (deletingCommentId !== comment.id) {
                                          e.currentTarget.style.backgroundColor = '#fef2f2'
                                        }
                                      }}
                                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff' }}
                                    >
                                      {deletingCommentId === comment.id ? 'Deleting...' : 'Dismiss'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))
                    ) : (
                      <p style={{ color: '#6b7280', fontSize: '14px', fontStyle: 'italic' }}>No comments yet. Select text in the contract to add a comment.</p>
                    )}
                    </div>
                  )}
                </div>

                {/* Revisions panel */}
                <div style={{ display: 'flex', flexDirection: 'column', height: getGroupHeight('revisions'), minHeight: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '12px',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                    onClick={() => toggleGroupCollapse('revisions')}
                  >
                    <span style={{
                      fontSize: '14px',
                      color: '#6b7280',
                      transform: collapsedGroups.has('revisions') ? 'rotate(0deg)' : 'rotate(90deg)',
                      transition: 'transform 0.2s'
                    }}>
                      ▶
                    </span>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                      Revisions ({selectedContract.annotations?.revisions?.length || 0})
                    </h3>
                  </div>
                  {!collapsedGroups.has('revisions') && (
                    <div className="revisions-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1 }}>
                      {selectedContract.annotations?.revisions?.length ? (
                      selectedContract.annotations.revisions
                        .slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                        .map((rev) => (
                          <div key={rev.id} className="revision-item" style={{
                            padding: '12px',
                            backgroundColor: rev.status === 'accepted'
                              ? '#f0fdf4'
                              : rev.status === 'rejected'
                                ? '#fef2f2'
                                : rev.status === 'conflict'
                                  ? '#fef3c7'
                                  : rev.status === 'stale'
                                    ? '#f3f4f6'
                                    : selectedRevision?.id === rev.id
                                      ? '#dbeafe'
                                      : '#ffffff',
                            border: rev.status === 'accepted'
                              ? '1px solid #bbf7d0'
                              : rev.status === 'rejected'
                                ? '1px solid #fecaca'
                                : rev.status === 'conflict'
                                  ? '1px solid #f59e0b'
                                  : rev.status === 'stale'
                                    ? '1px solid #9ca3af'
                                    : '1px solid #e5e7eb',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            opacity: rev.status === 'accepted' || rev.status === 'rejected' || rev.status === 'conflict' || rev.status === 'stale' ? 0.8 : 1
                          }} onClick={(e) => {
                            const target = e.target as HTMLElement
                            if (target.closest('button, textarea')) return
                            setSelectedRevision(rev)
                          }}>
                            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>Section {rev.node_id}</span>
                              <span>{new Date(rev.created_at).toLocaleDateString()}</span>
                            </div>
                            <div style={{
                              fontSize: '14px',
                              color: rev.status === 'accepted'
                                ? '#059669'
                                : rev.status === 'rejected'
                                  ? '#dc2626'
                                  : rev.status === 'conflict'
                                    ? '#92400e'
                                    : rev.status === 'stale'
                                      ? '#6b7280'
                                      : '#dc2626',
                              marginBottom: '8px',
                              textDecoration: rev.status === 'rejected' || rev.status === 'stale' ? 'line-through' : 'none'
                            }}>
                              {rev.new_text}
                            </div>
                            {rev.status === 'accepted' ? (
                              <div style={{
                                fontSize: '12px',
                                color: '#059669',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <span>✓</span>
                                Accepted
                              </div>
                            ) : rev.status === 'rejected' ? (
                              <div style={{
                                fontSize: '12px',
                                color: '#dc2626',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <span>✗</span>
                                Rejected
                              </div>
                            ) : rev.status === 'conflict' ? (
                              <div style={{
                                fontSize: '12px',
                                color: '#f59e0b',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <span>⚠</span>
                                Conflict
                              </div>
                            ) : rev.status === 'stale' ? (
                              <div style={{
                                fontSize: '12px',
                                color: '#6b7280',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <span>⏰</span>
                                Stale
                              </div>
                            ) : editingRevision?.id === rev.id ? (
                              <div>
                                <textarea value={editingRevisionText} onChange={(e) => setEditingRevisionText(e.target.value)} onClick={(e) => e.stopPropagation()} style={{ width: '100%', minHeight: '60px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', resize: 'vertical', fontFamily: 'inherit', marginBottom: '8px' }} />
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                  <button onClick={(e) => { e.stopPropagation(); setEditingRevision(null); setEditingRevisionText('') }} style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: '#ffffff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                                  <button onClick={(e) => { e.stopPropagation(); const t = editingRevisionText.trim(); if (t && t !== rev.new_text) { handleRevisionEdit(rev.id, t) } else { setEditingRevision(null); setEditingRevisionText('') } }} style={{ padding: '4px 8px', border: 'none', borderRadius: '4px', backgroundColor: '#3b82f6', color: '#ffffff', fontSize: '12px', cursor: 'pointer' }}>Save</button>
                                </div>
                              </div>
                            ) : rev.status === 'conflict' || rev.status === 'stale' ? (
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleRevisionDelete(rev.id)
                                  }}
                                  disabled={deletingRevisionId === rev.id}
                                  style={{
                                    padding: '4px 8px',
                                    border: '1px solid #ef4444',
                                    borderRadius: '4px',
                                    backgroundColor: '#ffffff',
                                    color: deletingRevisionId === rev.id ? '#9ca3af' : '#ef4444',
                                    fontSize: '12px',
                                    cursor: deletingRevisionId === rev.id ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    opacity: deletingRevisionId === rev.id ? 0.6 : 1
                                  }}
                                  onMouseEnter={(e) => {
                                    if (deletingRevisionId !== rev.id) {
                                      e.currentTarget.style.backgroundColor = '#fef2f2'
                                    }
                                  }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff' }}
                                >
                                  {deletingRevisionId === rev.id ? 'Deleting...' : 'Dismiss'}
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setEditingRevision(rev)
                                    setEditingRevisionText(rev.new_text)
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    backgroundColor: '#ffffff',
                                    color: '#6b7280',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6' }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff' }}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleRevisionResolve(rev.id, 'accepted')
                                  }}
                                  disabled={resolvingRevisionId === rev.id}
                                  style={{
                                    padding: '4px 8px',
                                    border: '1px solid #059669',
                                    borderRadius: '4px',
                                    backgroundColor: '#ffffff',
                                    color: resolvingRevisionId === rev.id ? '#9ca3af' : '#059669',
                                    fontSize: '12px',
                                    cursor: resolvingRevisionId === rev.id ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    opacity: resolvingRevisionId === rev.id ? 0.6 : 1
                                  }}
                                  onMouseEnter={(e) => {
                                    if (resolvingRevisionId !== rev.id) {
                                      e.currentTarget.style.backgroundColor = '#f0fdf4'
                                    }
                                  }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff' }}
                                >
                                  {resolvingRevisionId === rev.id ? 'Accepting...' : 'Accept'}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleRevisionResolve(rev.id, 'rejected')
                                  }}
                                  disabled={resolvingRevisionId === rev.id}
                                  style={{
                                    padding: '4px 8px',
                                    border: '1px solid #dc2626',
                                    borderRadius: '4px',
                                    backgroundColor: '#ffffff',
                                    color: resolvingRevisionId === rev.id ? '#9ca3af' : '#dc2626',
                                    fontSize: '12px',
                                    cursor: resolvingRevisionId === rev.id ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    opacity: resolvingRevisionId === rev.id ? 0.6 : 1
                                  }}
                                  onMouseEnter={(e) => {
                                    if (resolvingRevisionId !== rev.id) {
                                      e.currentTarget.style.backgroundColor = '#fef2f2'
                                    }
                                  }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff' }}
                                >
                                  {resolvingRevisionId === rev.id ? 'Rejecting...' : 'Reject'}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleRevisionDelete(rev.id)
                                  }}
                                  disabled={deletingRevisionId === rev.id}
                                  style={{
                                    padding: '4px 8px',
                                    border: '1px solid #ef4444',
                                    borderRadius: '4px',
                                    backgroundColor: '#ffffff',
                                    color: deletingRevisionId === rev.id ? '#9ca3af' : '#ef4444',
                                    fontSize: '12px',
                                    cursor: deletingRevisionId === rev.id ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    opacity: deletingRevisionId === rev.id ? 0.6 : 1
                                  }}
                                  onMouseEnter={(e) => {
                                    if (deletingRevisionId !== rev.id) {
                                      e.currentTarget.style.backgroundColor = '#fef2f2'
                                    }
                                  }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff' }}
                                >
                                  {deletingRevisionId === rev.id ? 'Deleting...' : 'Dismiss'}
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                    ) : (
                      <p style={{ color: '#6b7280', fontSize: '14px', fontStyle: 'italic' }}>No revisions yet. Select text and choose Suggest Revision.</p>
                    )}
                    </div>
                  )}
                </div>

                {/* Added Sections panel */}
                <div style={{ display: 'flex', flexDirection: 'column', height: getGroupHeight('section_adds'), minHeight: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '12px',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                    onClick={() => toggleGroupCollapse('section_adds')}
                  >
                    <span style={{
                      fontSize: '14px',
                      color: '#6b7280',
                      transform: collapsedGroups.has('section_adds') ? 'rotate(0deg)' : 'rotate(90deg)',
                      transition: 'transform 0.2s'
                    }}>
                      ▶
                    </span>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                      Added Sections ({selectedContract.annotations?.section_adds?.length || 0})
                    </h3>
                  </div>
                  {!collapsedGroups.has('section_adds') && (
                    <div className="section-adds-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1 }}>
                      {selectedContract.annotations?.section_adds?.length ? (
                      selectedContract.annotations.section_adds
                        .slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                        .map((sectionAdd) => (
                          <div key={sectionAdd.id} className="section-add-item" style={{
                            padding: '12px',
                            backgroundColor: sectionAdd.status === 'accepted'
                              ? '#f0fdf4'
                              : sectionAdd.status === 'rejected'
                                ? '#fef2f2'
                                : sectionAdd.status === 'conflict'
                                  ? '#fef3c7'
                                  : sectionAdd.status === 'stale'
                                    ? '#f3f4f6'
                                    : '#ffffff',
                            border: sectionAdd.status === 'accepted'
                              ? '1px solid #bbf7d0'
                              : sectionAdd.status === 'rejected'
                                ? '1px solid #fecaca'
                                : sectionAdd.status === 'conflict'
                                  ? '1px solid #f59e0b'
                                  : sectionAdd.status === 'stale'
                                    ? '1px solid #9ca3af'
                                    : '1px solid #e5e7eb',
                            borderRadius: '6px',
                            opacity: sectionAdd.status === 'accepted' || sectionAdd.status === 'rejected' || sectionAdd.status === 'conflict' || sectionAdd.status === 'stale' ? 0.8 : 1,
                            cursor: 'pointer'
                          }} onClick={() => {
                            // Navigate to the pending section in the tree
                            const element = document.querySelector(`[data-section-add-id="${sectionAdd.id}"]`)
                            if (element) {
                              (element as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                            }
                          }}>
                            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>Section {sectionAdd.new_node?.number || 'N/A'}</span>
                              <span>{new Date(sectionAdd.created_at).toLocaleDateString()}</span>
                            </div>
                            <div style={{
                              fontSize: '14px',
                              color: sectionAdd.status === 'accepted'
                                ? '#059669'
                                : sectionAdd.status === 'rejected'
                                  ? '#dc2626'
                                  : sectionAdd.status === 'conflict'
                                    ? '#92400e'
                                    : sectionAdd.status === 'stale'
                                      ? '#6b7280'
                                      : '#374151',
                              marginBottom: '8px',
                              textDecoration: sectionAdd.status === 'rejected' || sectionAdd.status === 'stale' ? 'line-through' : 'none'
                            }}>
                              {sectionAdd.new_node?.markdown?.split('\n')[0]?.replace(/^#+\s*/, '') || sectionAdd.new_node?.name || 'New Section'}
                            </div>
                            {sectionAdd.status === 'accepted' ? (
                              <div style={{
                                fontSize: '12px',
                                color: '#059669',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <span>✓</span>
                                Accepted
                              </div>
                            ) : sectionAdd.status === 'rejected' ? (
                              <div style={{
                                fontSize: '12px',
                                color: '#dc2626',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <span>✗</span>
                                Rejected
                              </div>
                            ) : sectionAdd.status === 'conflict' ? (
                              <div style={{
                                fontSize: '12px',
                                color: '#f59e0b',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <span>⚠</span>
                                Conflict
                              </div>
                            ) : sectionAdd.status === 'stale' ? (
                              <div style={{
                                fontSize: '12px',
                                color: '#6b7280',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <span>⏰</span>
                                Stale
                              </div>
                            ) : sectionAdd.status === 'conflict' ? (
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleSectionAddDelete(sectionAdd.id)
                                  }}
                                  disabled={deletingSectionAddId === sectionAdd.id}
                                  style={{
                                    padding: '4px 8px',
                                    border: '1px solid #ef4444',
                                    borderRadius: '4px',
                                    backgroundColor: '#ffffff',
                                    color: deletingSectionAddId === sectionAdd.id ? '#9ca3af' : '#ef4444',
                                    fontSize: '12px',
                                    cursor: deletingSectionAddId === sectionAdd.id ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    opacity: deletingSectionAddId === sectionAdd.id ? 0.6 : 1
                                  }}
                                  onMouseEnter={(e) => {
                                    if (deletingSectionAddId !== sectionAdd.id) {
                                      e.currentTarget.style.backgroundColor = '#fef2f2'
                                    }
                                  }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff' }}
                                >
                                  {deletingSectionAddId === sectionAdd.id ? 'Deleting...' : 'Dismiss'}
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleSectionAddResolve(sectionAdd.id, 'accepted')
                                  }}
                                  disabled={resolvingSectionAddId === sectionAdd.id}
                                  style={{
                                    padding: '4px 8px',
                                    border: '1px solid #059669',
                                    borderRadius: '4px',
                                    backgroundColor: '#ffffff',
                                    color: resolvingSectionAddId === sectionAdd.id ? '#9ca3af' : '#059669',
                                    fontSize: '12px',
                                    cursor: resolvingSectionAddId === sectionAdd.id ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    opacity: resolvingSectionAddId === sectionAdd.id ? 0.6 : 1
                                  }}
                                  onMouseEnter={(e) => {
                                    if (resolvingSectionAddId !== sectionAdd.id) {
                                      e.currentTarget.style.backgroundColor = '#f0fdf4'
                                    }
                                  }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff' }}
                                >
                                  {resolvingSectionAddId === sectionAdd.id ? 'Accepting...' : 'Accept'}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleSectionAddResolve(sectionAdd.id, 'rejected')
                                  }}
                                  disabled={resolvingSectionAddId === sectionAdd.id}
                                  style={{
                                    padding: '4px 8px',
                                    border: '1px solid #dc2626',
                                    borderRadius: '4px',
                                    backgroundColor: '#ffffff',
                                    color: resolvingSectionAddId === sectionAdd.id ? '#9ca3af' : '#dc2626',
                                    fontSize: '12px',
                                    cursor: resolvingSectionAddId === sectionAdd.id ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    opacity: resolvingSectionAddId === sectionAdd.id ? 0.6 : 1
                                  }}
                                  onMouseEnter={(e) => {
                                    if (resolvingSectionAddId !== sectionAdd.id) {
                                      e.currentTarget.style.backgroundColor = '#fef2f2'
                                    }
                                  }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff' }}
                                >
                                  {resolvingSectionAddId === sectionAdd.id ? 'Rejecting...' : 'Reject'}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleSectionAddDelete(sectionAdd.id)
                                  }}
                                  disabled={deletingSectionAddId === sectionAdd.id}
                                  style={{
                                    padding: '4px 8px',
                                    border: '1px solid #ef4444',
                                    borderRadius: '4px',
                                    backgroundColor: '#ffffff',
                                    color: deletingSectionAddId === sectionAdd.id ? '#9ca3af' : '#ef4444',
                                    fontSize: '12px',
                                    cursor: deletingSectionAddId === sectionAdd.id ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    opacity: deletingSectionAddId === sectionAdd.id ? 0.6 : 1
                                  }}
                                  onMouseEnter={(e) => {
                                    if (deletingSectionAddId !== sectionAdd.id) {
                                      e.currentTarget.style.backgroundColor = '#fef2f2'
                                    }
                                  }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff' }}
                                >
                                  {deletingSectionAddId === sectionAdd.id ? 'Deleting...' : 'Dismiss'}
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                    ) : (
                      <p style={{ color: '#6b7280', fontSize: '14px', fontStyle: 'italic' }}>No section additions yet.</p>
                    )}
                    </div>
                  )}
                </div>

                {/* Removed Sections panel */}
                <div style={{ display: 'flex', flexDirection: 'column', height: getGroupHeight('section_removes'), minHeight: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '12px',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                    onClick={() => toggleGroupCollapse('section_removes')}
                  >
                    <span style={{
                      fontSize: '14px',
                      color: '#6b7280',
                      transform: collapsedGroups.has('section_removes') ? 'rotate(0deg)' : 'rotate(90deg)',
                      transition: 'transform 0.2s'
                    }}>
                      ▶
                    </span>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                      Removed Sections ({selectedContract.annotations?.section_removes?.length || 0})
                    </h3>
                  </div>
                  {!collapsedGroups.has('section_removes') && (
                    <div className="section-removes-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1 }}>
                      {selectedContract.annotations?.section_removes?.length ? (
                      selectedContract.annotations.section_removes
                        .slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                        .map((sectionRemove) => (
                          <div key={sectionRemove.id} className="section-remove-item" style={{
                            padding: '12px',
                            backgroundColor: sectionRemove.status === 'accepted'
                              ? '#f0fdf4'
                              : sectionRemove.status === 'rejected'
                                ? '#fef2f2'
                                : sectionRemove.status === 'conflict'
                                  ? '#fef3c7'
                                  : sectionRemove.status === 'stale'
                                    ? '#f3f4f6'
                                    : '#ffffff',
                            border: sectionRemove.status === 'accepted'
                              ? '1px solid #bbf7d0'
                              : sectionRemove.status === 'rejected'
                                ? '1px solid #fecaca'
                                : sectionRemove.status === 'conflict'
                                  ? '1px solid #f59e0b'
                                  : sectionRemove.status === 'stale'
                                    ? '1px solid #9ca3af'
                                    : '1px solid #e5e7eb',
                            borderRadius: '6px',
                            opacity: sectionRemove.status === 'accepted' || sectionRemove.status === 'rejected' || sectionRemove.status === 'conflict' || sectionRemove.status === 'stale' ? 0.8 : 1,
                            cursor: 'pointer'
                          }} onClick={() => {
                            // Navigate to the section that was marked for removal
                            const element = document.querySelector(`[data-node-id="${sectionRemove.node_id}"]`)
                            if (element) {
                              (element as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                            }
                          }}>
                            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>Section: {sectionRemove.node_id}</span>
                              <span>{new Date(sectionRemove.created_at).toLocaleDateString()}</span>
                            </div>
                            <div style={{
                              fontSize: '14px',
                              color: sectionRemove.status === 'accepted'
                                ? '#059669'
                                : sectionRemove.status === 'rejected'
                                  ? '#dc2626'
                                  : sectionRemove.status === 'conflict'
                                    ? '#92400e'
                                    : sectionRemove.status === 'stale'
                                      ? '#6b7280'
                                      : '#374151',
                              marginBottom: '8px',
                              textDecoration: sectionRemove.status === 'rejected' || sectionRemove.status === 'stale' ? 'line-through' : 'none'
                            }}>
                              Section Removal
                            </div>
                            {sectionRemove.status === 'accepted' ? (
                              <div style={{
                                fontSize: '12px',
                                color: '#059669',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <span>✓</span>
                                Accepted
                              </div>
                            ) : sectionRemove.status === 'rejected' ? (
                              <div style={{
                                fontSize: '12px',
                                color: '#dc2626',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <span>✗</span>
                                Rejected
                              </div>
                            ) : sectionRemove.status === 'conflict' ? (
                              <div style={{
                                fontSize: '12px',
                                color: '#f59e0b',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <span>⚠</span>
                                Conflict
                              </div>
                            ) : sectionRemove.status === 'stale' ? (
                              <div style={{
                                fontSize: '12px',
                                color: '#6b7280',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <span>⏰</span>
                                Stale
                              </div>
                            ) : sectionRemove.status === 'conflict' ? (
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleSectionRemoveDelete(sectionRemove.id)
                                  }}
                                  disabled={deletingSectionRemoveId === sectionRemove.id}
                                  style={{
                                    padding: '4px 8px',
                                    border: '1px solid #ef4444',
                                    borderRadius: '4px',
                                    backgroundColor: '#ffffff',
                                    color: deletingSectionRemoveId === sectionRemove.id ? '#9ca3af' : '#ef4444',
                                    fontSize: '12px',
                                    cursor: deletingSectionRemoveId === sectionRemove.id ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    opacity: deletingSectionRemoveId === sectionRemove.id ? 0.6 : 1
                                  }}
                                  onMouseEnter={(e) => {
                                    if (deletingSectionRemoveId !== sectionRemove.id) {
                                      e.currentTarget.style.backgroundColor = '#fef2f2'
                                    }
                                  }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff' }}
                                >
                                  {deletingSectionRemoveId === sectionRemove.id ? 'Deleting...' : 'Dismiss'}
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleSectionRemoveResolve(sectionRemove.id, 'accepted')
                                  }}
                                  disabled={resolvingSectionRemoveId === sectionRemove.id}
                                  style={{
                                    padding: '4px 8px',
                                    border: '1px solid #059669',
                                    borderRadius: '4px',
                                    backgroundColor: '#ffffff',
                                    color: resolvingSectionRemoveId === sectionRemove.id ? '#9ca3af' : '#059669',
                                    fontSize: '12px',
                                    cursor: resolvingSectionRemoveId === sectionRemove.id ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    opacity: resolvingSectionRemoveId === sectionRemove.id ? 0.6 : 1
                                  }}
                                  onMouseEnter={(e) => {
                                    if (resolvingSectionRemoveId !== sectionRemove.id) {
                                      e.currentTarget.style.backgroundColor = '#f0fdf4'
                                    }
                                  }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff' }}
                                >
                                  {resolvingSectionRemoveId === sectionRemove.id ? 'Accepting...' : 'Accept'}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleSectionRemoveResolve(sectionRemove.id, 'rejected')
                                  }}
                                  disabled={resolvingSectionRemoveId === sectionRemove.id}
                                  style={{
                                    padding: '4px 8px',
                                    border: '1px solid #dc2626',
                                    borderRadius: '4px',
                                    backgroundColor: '#ffffff',
                                    color: resolvingSectionRemoveId === sectionRemove.id ? '#9ca3af' : '#dc2626',
                                    fontSize: '12px',
                                    cursor: resolvingSectionRemoveId === sectionRemove.id ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    opacity: resolvingSectionRemoveId === sectionRemove.id ? 0.6 : 1
                                  }}
                                  onMouseEnter={(e) => {
                                    if (resolvingSectionRemoveId !== sectionRemove.id) {
                                      e.currentTarget.style.backgroundColor = '#fef2f2'
                                    }
                                  }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff' }}
                                >
                                  {resolvingSectionRemoveId === sectionRemove.id ? 'Rejecting...' : 'Reject'}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleSectionRemoveDelete(sectionRemove.id)
                                  }}
                                  disabled={deletingSectionRemoveId === sectionRemove.id}
                                  style={{
                                    padding: '4px 8px',
                                    border: '1px solid #ef4444',
                                    borderRadius: '4px',
                                    backgroundColor: '#ffffff',
                                    color: deletingSectionRemoveId === sectionRemove.id ? '#9ca3af' : '#ef4444',
                                    fontSize: '12px',
                                    cursor: deletingSectionRemoveId === sectionRemove.id ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    opacity: deletingSectionRemoveId === sectionRemove.id ? 0.6 : 1
                                  }}
                                  onMouseEnter={(e) => {
                                    if (deletingSectionRemoveId !== sectionRemove.id) {
                                      e.currentTarget.style.backgroundColor = '#fef2f2'
                                    }
                                  }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff' }}
                                >
                                  {deletingSectionRemoveId === sectionRemove.id ? 'Deleting...' : 'Dismiss'}
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                    ) : (
                      <p style={{ color: '#6b7280', fontSize: '14px', fontStyle: 'italic' }}>No section removals yet.</p>
                    )}
                    </div>
                  )}
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
