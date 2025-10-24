import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNotificationContext } from './common/NotificationProvider'
import {
  ContractSectionNode,
  CommentAnnotation,
  RevisionAnnotation,
  ContractAnnotations,
  AnnotationModalState,
  SectionModalState,
  SectionFormData,
  SectionAddAnnotation,
  SectionRemoveAnnotation
} from './contracts/types'
import AnnotationModal from './contracts/AnnotationModal'
import SectionModal from './contracts/SectionModal'
import SectionNode from './contracts/SectionNode'
import PendingSectionAdd from './contracts/PendingSectionAdd'

interface ContractSectionTreeProps {
  section: ContractSectionNode
  annotations?: ContractAnnotations
  onCommentCreate?: (nodeId: string, offsetBeg: number, offsetEnd: number, anchorText: string, commentText: string) => void
  onCommentEdit?: (annotationId: string, commentText: string) => void
  onRevisionCreate?: (nodeId: string, offsetBeg: number, offsetEnd: number, oldText: string, newText: string) => void
  onRevisionEdit?: (annotationId: string, newText: string) => void
  onSectionAdd?: (targetParentId: string, insertionIndex: number, newSectionNode: ContractSectionNode) => void
  onSectionRemove?: (targetNodeId: string) => void
  selectedComment?: CommentAnnotation | null
  onCommentSelect?: (comment: CommentAnnotation | null) => void
  selectedRevision?: RevisionAnnotation | null
  onRevisionSelect?: (revision: RevisionAnnotation | null) => void
}

const ContractSectionTree: React.FC<ContractSectionTreeProps> = ({
  section,
  annotations,
  onCommentCreate,
  onCommentEdit,
  onRevisionCreate,
  onRevisionEdit,
  onSectionAdd,
  onSectionRemove,
  selectedComment,
  onCommentSelect,
  selectedRevision,
  onRevisionSelect
}) => {
  const { showToast } = useNotificationContext()

  // Function to decode HTML entities
  const decodeHtmlEntities = (text: string): string => {
    const textarea = document.createElement('textarea')
    textarea.innerHTML = text
    return textarea.value
  }

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set([section.id]))
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [annotationModal, setAnnotationModal] = useState<AnnotationModalState>({
    isOpen: false,
    nodeId: '',
    offsetBeg: 0,
    offsetEnd: 0,
    selectedText: '',
    type: null
  })
  const [sectionModal, setSectionModal] = useState<SectionModalState>({
    isOpen: false,
    targetParentId: '',
    insertionIndex: 0,
    action: null
  })
  const [expandedPendingAddIds, setExpandedPendingAddIds] = useState<Set<string>>(new Set())

  // Build a quick lookup of nodeId -> node for expansion/navigation
  const nodeById = useMemo(() => {
    const map = new Map<string, ContractSectionNode>()
    const walk = (n: ContractSectionNode) => {
      map.set(n.id, n)
      n.children?.forEach(walk)
    }
    walk(section)
    return map
  }, [section])

  // On selected comment from sidebar: expand its node chain and scroll to the highlight
  useEffect(() => {
    if (!selectedComment) return
    const nodeId = selectedComment.node_id
    if (!nodeById.has(nodeId)) return

    // Expand the chain up to root
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      let current: ContractSectionNode | undefined = nodeById.get(nodeId)
      while (current) {
        next.add(current.id)
        current = current.parent_id ? nodeById.get(current.parent_id) : undefined
      }
      return next
    })

    // After expand state applies, scroll to the comment highlight
    const timer = setTimeout(() => {
      const container = document.querySelector(`[data-node-id="${nodeId}"] .section-markdown-inline`)
      const highlight = container?.querySelector(`[data-comment-id="${selectedComment.id}"]`) as HTMLElement | null
      if (highlight) {
        highlight.scrollIntoView({ behavior: 'smooth', block: 'center' })
        highlight.style.outline = '2px solid #3b82f6'
        setTimeout(() => {
          if (highlight) highlight.style.outline = 'none'
        }, 800)
      } else {
        const nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`)
        if (nodeElement) {
          ;(nodeElement as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [selectedComment, nodeById])

  // On selected revision from sidebar: expand and scroll
  useEffect(() => {
    if (!selectedRevision) return
    const nodeId = selectedRevision.node_id
    if (!nodeById.has(nodeId)) return

    setExpandedNodes((prev) => {
      const next = new Set(prev)
      let current: ContractSectionNode | undefined = nodeById.get(nodeId)
      while (current) {
        next.add(current.id)
        current = current.parent_id ? nodeById.get(current.parent_id) : undefined
      }
      return next
    })

    const timer = setTimeout(() => {
      const container = document.querySelector(`[data-node-id="${nodeId}"] .section-markdown-inline`)
      const revEl = container?.querySelector(`[data-revision-id="${selectedRevision.id}"]`) as HTMLElement | null
      if (revEl) {
        revEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else {
        const nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`)
        if (nodeElement) {
          ;(nodeElement as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [selectedRevision, nodeById])

  // Function to expand parent nodes for a given target parent ID
  const expandParentChain = useCallback((targetParentId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      let current: ContractSectionNode | undefined = nodeById.get(targetParentId)
      while (current) {
        next.add(current.id)
        current = current.parent_id ? nodeById.get(current.parent_id) : undefined
      }
      return next
    })
  }, [nodeById])

  // Listen for navigation to pending section adds/removes from sidebar
  useEffect(() => {
    const handleNavigation = (event: CustomEvent) => {
      const { type, targetId } = event.detail
      
      if (type === 'navigate-to-section-add') {
        // Find the section add annotation to get the target parent
        const sectionAdd = annotations?.section_adds?.find(sa => sa.id === targetId)
        if (sectionAdd) {
          expandParentChain(sectionAdd.target_parent_id)
          // Also expand the pending section add itself
          setExpandedPendingAddIds(prev => new Set(prev).add(targetId))
        }
      } else if (type === 'navigate-to-section-remove') {
        // For section removes, expand the chain to the node being removed
        expandParentChain(targetId)
      }
    }

    window.addEventListener('navigate-to-annotation', handleNavigation as EventListener)
    return () => window.removeEventListener('navigate-to-annotation', handleNavigation as EventListener)
  }, [annotations, expandParentChain])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenMenuId(null)
    }

    if (openMenuId) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [openMenuId])

  const handleMenuToggle = (nodeId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    setOpenMenuId(openMenuId === nodeId ? null : nodeId)
  }

  const handleMenuAction = (action: string, nodeId: string) => {
    setOpenMenuId(null)

    if (action === 'add-above' || action === 'add-below') {
      const parentNode = findParentNode(section, nodeId)
      if (parentNode) {
        const insertionIndex =
          action === 'add-above'
            ? parentNode.children?.findIndex((child) => child.id === nodeId) || 0
            : (parentNode.children?.findIndex((child) => child.id === nodeId) || 0) + 1

        setSectionModal({
          isOpen: true,
          targetParentId: parentNode.id,
          insertionIndex,
          action: action as 'add-above' | 'add-below'
        })
      }
    } else if (action === 'delete') {
      if (confirm('Are you sure you want to delete this section?') && onSectionRemove) {
        onSectionRemove(nodeId)
      }
    }
  }

  const findParentNode = (root: ContractSectionNode, targetId: string): ContractSectionNode | null => {
    if (root.children) {
      for (const child of root.children) {
        if (child.id === targetId) {
          return root
        }
        const found = findParentNode(child, targetId)
        if (found) return found
      }
    }
    return null
  }

  const findNodeById = (root: ContractSectionNode, targetId: string): ContractSectionNode | null => {
    if (root.id === targetId) return root
    if (root.children) {
      for (const child of root.children) {
        const found = findNodeById(child, targetId)
        if (found) return found
      }
    }
    return null
  }

  const inferSectionType = (parentNode: ContractSectionNode): string => {
    if (parentNode.type === 'root') return 'body'
    return parentNode.type || 'body'
  }

  const inferSectionLevel = (parentNode: ContractSectionNode): number => {
    return (parentNode.level || 0) + 1
  }

  const handleSectionFormSubmit = (formData: SectionFormData) => {
    if (!formData.number.trim()) {
      showToast({
        type: 'warning',
        title: 'Missing Section Number',
        message: 'Section number is required'
      })
      return
    }

    const parentNode = findNodeById(section, sectionModal.targetParentId)
    if (!parentNode || !onSectionAdd) return

    const sectionType = inferSectionType(parentNode)
    const sectionLevel = inferSectionLevel(parentNode)

    const newSectionNode: ContractSectionNode = {
      id: formData.number.trim(),
      type: sectionType,
      level: sectionLevel,
      number: formData.number.trim(),
      name: formData.name.trim() || undefined,
      markdown:
        formData.text.trim() ||
        `# ${formData.number.trim()}${formData.name.trim() ? ` - ${formData.name.trim()}` : ''}\n\n[New section content]`,
      parent_id: sectionModal.targetParentId,
      children: []
    }

    onSectionAdd(sectionModal.targetParentId, sectionModal.insertionIndex, newSectionNode)

    setSectionModal({ isOpen: false, targetParentId: '', insertionIndex: 0, action: null })
  }

  const handleAnnotationSubmit = (type: 'comment' | 'revision', content: string) => {
    if (type === 'comment' && onCommentCreate) {
      onCommentCreate(
        annotationModal.nodeId,
        annotationModal.offsetBeg,
        annotationModal.offsetEnd,
        annotationModal.selectedText,
        content
      )
    }
    if (type === 'revision' && onRevisionCreate) {
      onRevisionCreate(
        annotationModal.nodeId,
        annotationModal.offsetBeg,
        annotationModal.offsetEnd,
        annotationModal.selectedText,
        content
      )
    }

    setAnnotationModal({
      isOpen: false,
      nodeId: '',
      offsetBeg: 0,
      offsetEnd: 0,
      selectedText: '',
      type: null
    })
  }

  const getCommentsForNode = (nodeId: string): CommentAnnotation[] =>
    annotations?.comments?.filter((c) => c.node_id === nodeId) || []
  const getRevisionsForNode = (nodeId: string): RevisionAnnotation[] =>
    annotations?.revisions?.filter((r) => r.node_id === nodeId) || []
  const getPendingSectionAddsForParent = (parentId: string): SectionAddAnnotation[] =>
    annotations?.section_adds?.filter((s) => s.target_parent_id === parentId && s.status === 'pending') || []
  const getPendingSectionRemovesForNode = (nodeId: string): SectionRemoveAnnotation[] =>
    annotations?.section_removes?.filter((s) => s.node_id === nodeId && s.status === 'pending') || []

  const applyCommentHighlights = (container: HTMLElement, nodeId: string) => {
    const comments = getCommentsForNode(nodeId)
    if (!comments || comments.length === 0) return

    const activeComments = comments.filter((c) => c.status !== 'resolved')
    if (activeComments.length === 0) return

    const ranges = activeComments
      .slice()
      .sort((a, b) => a.offset_beg - b.offset_beg)
      .map((c) => ({ start: c.offset_beg, end: c.offset_end, id: c.id, selected: selectedComment?.id === c.id }))

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null)
    let globalOffset = 0
    let node: Node | null
    let rangeIdx = 0

    while ((node = walker.nextNode())) {
      const textNode = node as Text
      const text = textNode.nodeValue || ''
      const len = text.length
      if (len === 0) {
        continue
      }

      const nodeStart = globalOffset
      const nodeEnd = nodeStart + len

      while (rangeIdx < ranges.length && ranges[rangeIdx].end <= nodeStart) rangeIdx++

      const overlaps: { start: number; end: number; id: string; selected: boolean }[] = []
      let k = rangeIdx
      while (k < ranges.length && ranges[k].start < nodeEnd) {
        overlaps.push(ranges[k])
        if (ranges[k].end <= nodeEnd) {
          k++
        } else {
          break
        }
      }

      if (overlaps.length === 0) {
        globalOffset += len
        continue
      }

      const frag = document.createDocumentFragment()
      let localPos = 0
      overlaps.forEach((r) => {
        const localStart = Math.max(0, r.start - nodeStart)
        const localEnd = Math.min(len, r.end - nodeStart)
        if (localStart > localPos) {
          frag.appendChild(document.createTextNode(text.slice(localPos, localStart)))
        }
        const span = document.createElement('span')
        span.className = r.selected ? 'comment-highlight-selected' : 'comment-highlight'
        span.setAttribute('data-comment-id', r.id)
        span.style.backgroundColor = r.selected ? '#bfdbfe' : '#fef08a'
        span.style.padding = '1px 2px'
        span.style.borderRadius = '2px'
        span.style.cursor = 'pointer'
        span.textContent = text.slice(localStart, localEnd)
        span.onclick = (e) => handleCommentClick(r.id, e)
        frag.appendChild(span)
        localPos = localEnd
      })
      if (localPos < len) frag.appendChild(document.createTextNode(text.slice(localPos)))

      textNode.parentNode?.replaceChild(frag, textNode)

      globalOffset += len

      while (rangeIdx < ranges.length && ranges[rangeIdx].end <= nodeEnd) rangeIdx++
    }
  }

  const applyRevisionHighlights = (container: HTMLElement, nodeId: string) => {
    const revisions = getRevisionsForNode(nodeId)
    if (!revisions || revisions.length === 0) return

    const activeRevisions = revisions.filter((r) => ['pending', 'rejected'].includes(r.status))
    if (activeRevisions.length === 0) return

    const ranges = activeRevisions
      .slice()
      .sort((a, b) => a.offset_beg - b.offset_beg)
      .map((r) => ({
        start: r.offset_beg,
        end: r.offset_end,
        id: r.id,
        old_text: r.old_text,
        new_text: r.new_text,
        status: r.status,
        selected: selectedRevision?.id === r.id
      }))

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null)
    let globalOffset = 0
    let node: Node | null
    let rangeIdx = 0
    const insertedNewText = new Set<string>()

    while ((node = walker.nextNode())) {
      const textNode = node as Text
      const text = textNode.nodeValue || ''
      const len = text.length
      if (len === 0) {
        continue
      }
      const nodeStart = globalOffset
      const nodeEnd = nodeStart + len
      while (rangeIdx < ranges.length && ranges[rangeIdx].end <= nodeStart) rangeIdx++

      const overlaps: typeof ranges = [] as any
      let k = rangeIdx
      while (k < ranges.length && ranges[k].start < nodeEnd) {
        overlaps.push(ranges[k])
        if (ranges[k].end <= nodeEnd) k++
        else break
      }

      if (overlaps.length === 0) {
        globalOffset += len
        continue
      }

      const frag = document.createDocumentFragment()
      let localPos = 0
      overlaps.forEach((r) => {
        const localStart = Math.max(0, r.start - nodeStart)
        const localEnd = Math.min(len, r.end - nodeStart)
        if (localStart > localPos) frag.appendChild(document.createTextNode(text.slice(localPos, localStart)))

        const isFinalSliceInThisNode = r.end <= nodeEnd

        if (r.status === 'pending') {
          if (!insertedNewText.has(r.id)) {
            const del = document.createElement('del')
            del.className = 'revision-old'
            del.style.color = '#dc2626'
            del.setAttribute('data-revision-id', r.id)
            del.onclick = (e) => handleRevisionClick(r.id, e)
            del.textContent = r.old_text

            if (r.selected) {
              del.style.backgroundColor = '#dbeafe'
              del.style.padding = '2px 4px'
              del.style.borderRadius = '4px'
              del.style.border = '2px solid #3b82f6'
            }

            frag.appendChild(del)

            const ins = document.createElement('span')
            ins.className = 'revision-new'
            ins.style.color = '#059669'
            ins.setAttribute('data-revision-id', r.id)
            ins.onclick = (e) => handleRevisionClick(r.id, e)
            ins.textContent = r.new_text

            if (r.selected) {
              ins.style.backgroundColor = '#dbeafe'
              ins.style.padding = '2px 4px'
              ins.style.borderRadius = '4px'
              ins.style.border = '2px solid #3b82f6'
            }

            frag.appendChild(ins)
            insertedNewText.add(r.id)
          }
        } else if (r.status === 'rejected') {
          if (!insertedNewText.has(r.id)) {
            frag.appendChild(document.createTextNode(r.old_text))
            insertedNewText.add(r.id)
          }
        }

        localPos = localEnd
      })
      if (localPos < len) frag.appendChild(document.createTextNode(text.slice(localPos)))
      textNode.parentNode?.replaceChild(frag, textNode)
      globalOffset += len
      while (rangeIdx < ranges.length && ranges[rangeIdx].end <= nodeEnd) rangeIdx++
    }
  }

  const handleCommentClick = (commentId: string, event: Event) => {
    event.stopPropagation?.()
    const comment = annotations?.comments?.find((c) => c.id === commentId)
    if (comment && onCommentSelect) {
      onCommentSelect(comment)
    }
  }

  const handleRevisionClick = (revisionId: string, event: Event) => {
    event.stopPropagation?.()
    const rev = annotations?.revisions?.find((r) => r.id === revisionId)
    if (rev && onRevisionSelect) onRevisionSelect(rev)
  }

  // Re-apply highlights when annotations or selection change
  useEffect(() => {
    const containers = Array.from(document.querySelectorAll('.section-node .section-markdown-inline')) as HTMLElement[]
    containers.forEach((markdownInline) => {
      const inner = markdownInline.firstElementChild as HTMLElement | null
      if (!inner) return

      const originalMarkdown = markdownInline.getAttribute('data-original-markdown') || ''
      if (!originalMarkdown) return

      const cachedMarkdown = markdownInline.getAttribute('data-cached-markdown') || ''
      if (cachedMarkdown !== originalMarkdown) {
        markdownInline.removeAttribute('data-original-text')
        markdownInline.setAttribute('data-cached-markdown', originalMarkdown)
      }

      if (!markdownInline.hasAttribute('data-original-text')) {
        markdownInline.setAttribute('data-original-text', inner.textContent || '')
      }

      const originalText = markdownInline.getAttribute('data-original-text') || ''

      while (inner.firstChild) {
        inner.removeChild(inner.firstChild)
      }
      inner.appendChild(document.createTextNode(originalText))

      const sectionNode = markdownInline.closest('.section-node') as HTMLElement | null
      const nodeId = sectionNode?.getAttribute('data-node-id') || ''
      if (nodeId) {
        applyRevisionHighlights(inner, nodeId)
        applyCommentHighlights(inner, nodeId)
      }
    })
  }, [annotations, selectedComment, selectedRevision, expandedNodes])

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId)
        const removeDescendants = (node: ContractSectionNode) => {
          if (node.children) {
            node.children.forEach((child) => {
              newSet.delete(child.id)
              removeDescendants(child)
            })
          }
        }
        const findAndRemoveDescendants = (node: ContractSectionNode) => {
          if (node.id === nodeId) {
            removeDescendants(node)
          } else if (node.children) {
            node.children.forEach((child) => findAndRemoveDescendants(child))
          }
        }
        findAndRemoveDescendants(section)
      } else {
        newSet.add(nodeId)
        const addDescendants = (node: ContractSectionNode) => {
          if (node.children) {
            node.children.forEach((child) => {
              newSet.add(child.id)
              addDescendants(child)
            })
          }
        }
        const findAndAddDescendants = (node: ContractSectionNode) => {
          if (node.id === nodeId) {
            addDescendants(node)
          } else if (node.children) {
            node.children.forEach((child) => findAndAddDescendants(child))
          }
        }
        findAndAddDescendants(section)
      }
      return newSet
    })
  }

  const handleTogglePendingAdd = useCallback((id: string) => {
    setExpandedPendingAddIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleTextSelection = useCallback(
    (nodeId: string, offsetBeg: number, offsetEnd: number, selectedText: string) => {
      setAnnotationModal({
        isOpen: true,
        nodeId,
        offsetBeg,
        offsetEnd,
        selectedText,
        type: null
      })
    },
    []
  )

  const renderSectionNode = useCallback(
    (node: ContractSectionNode, depth: number = 0): React.ReactNode => {
      const isExpanded = expandedNodes.has(node.id)
      const pendingRemoves = getPendingSectionRemovesForNode(node.id)

      return (
        <SectionNode
          key={node.id}
          node={node}
          depth={depth}
          isExpanded={isExpanded}
          pendingRemoves={pendingRemoves}
          openMenuId={openMenuId}
          expandedPendingAddIds={expandedPendingAddIds}
          onToggleNode={toggleNode}
          onMenuToggle={handleMenuToggle}
          onMenuAction={handleMenuAction}
          onTextSelection={handleTextSelection}
          decodeHtmlEntities={decodeHtmlEntities}
          getPendingSectionAddsForParent={getPendingSectionAddsForParent}
          onTogglePendingAdd={handleTogglePendingAdd}
          renderSectionNode={renderSectionNode}
        />
      )
    },
    [
      expandedNodes,
      openMenuId,
      expandedPendingAddIds,
      handleTogglePendingAdd,
      handleTextSelection,
      getPendingSectionRemovesForNode,
      getPendingSectionAddsForParent
    ]
  )

  return (
    <>
      <div
        className="contract-section-tree"
        style={{
          maxHeight: '80vh',
          overflowY: 'auto',
          padding: '16px',
          backgroundColor: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          width: '100%',
          minWidth: 0
        }}
      >
        {(() => {
          // Get pending section adds for the root node
          const rootPendingAdds = getPendingSectionAddsForParent(section.id)
          const allChildren: Array<{ type: 'existing' | 'pending'; data: any; index: number }> = []

          // Add existing children
          if (section.children) {
            section.children.forEach((child, index) => {
              allChildren.push({ type: 'existing', data: child, index })
            })
          }

          // Add pending section adds for root
          rootPendingAdds.forEach((sectionAdd) => {
            allChildren.push({ type: 'pending', data: sectionAdd, index: sectionAdd.insertion_index })
          })

          // Sort by index
          allChildren.sort((a, b) => a.index - b.index)

          return allChildren.map((item) => {
            if (item.type === 'existing') {
              return renderSectionNode(item.data, 0)
            } else {
              return (
                <PendingSectionAdd
                  key={`pending-${item.data.id}`}
                  sectionAdd={item.data}
                  depth={0}
                  isExpanded={expandedPendingAddIds.has(item.data.id)}
                  onToggleExpand={() => handleTogglePendingAdd(item.data.id)}
                />
              )
            }
          })
        })()}
      </div>

      <AnnotationModal
        modal={annotationModal}
        onClose={() =>
          setAnnotationModal({
            isOpen: false,
            nodeId: '',
            offsetBeg: 0,
            offsetEnd: 0,
            selectedText: '',
            type: null
          })
        }
        onSubmit={handleAnnotationSubmit}
        decodeHtmlEntities={decodeHtmlEntities}
      />

      <SectionModal
        modal={sectionModal}
        onClose={() => setSectionModal({ isOpen: false, targetParentId: '', insertionIndex: 0, action: null })}
        onSubmit={handleSectionFormSubmit}
      />
    </>
  )
}

export default ContractSectionTree
