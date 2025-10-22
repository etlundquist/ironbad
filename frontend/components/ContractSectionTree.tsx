import React, { useState, useEffect, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import { useNotificationContext } from './common/NotificationProvider'

interface ContractSectionNode {
  id: string
  type: string
  level: number
  number: string
  name?: string
  markdown: string
  parent_id?: string
  children?: ContractSectionNode[]
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

interface ContractSectionTreeProps {
  section: ContractSectionNode
  annotations?: ContractAnnotations
  onCommentCreate?: (nodeId: string, offsetBeg: number, offsetEnd: number, anchorText: string, commentText: string) => void
  onCommentEdit?: (annotationId: string, commentText: string) => void
  // revision handlers
  onRevisionCreate?: (nodeId: string, offsetBeg: number, offsetEnd: number, oldText: string, newText: string) => void
  onRevisionEdit?: (annotationId: string, newText: string) => void
  // section handlers
  onSectionAdd?: (targetParentId: string, insertionIndex: number, newSectionNode: any) => void
  onSectionRemove?: (targetNodeId: string) => void
  selectedComment?: CommentAnnotation | null
  onCommentSelect?: (comment: CommentAnnotation | null) => void
  selectedRevision?: RevisionAnnotation | null
  onRevisionSelect?: (revision: RevisionAnnotation | null) => void
}

interface AnnotationModal {
  isOpen: boolean
  nodeId: string
  offsetBeg: number
  offsetEnd: number
  selectedText: string
  type: 'comment' | 'revision' | null
}

interface SectionModal {
  isOpen: boolean
  targetParentId: string
  insertionIndex: number
  action: 'add-above' | 'add-below' | null
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
  const [annotationModal, setAnnotationModal] = useState<AnnotationModal>({
    isOpen: false,
    nodeId: '',
    offsetBeg: 0,
    offsetEnd: 0,
    selectedText: '',
    type: null
  })
  const [sectionModal, setSectionModal] = useState<SectionModal>({
    isOpen: false,
    targetParentId: '',
    insertionIndex: 0,
    action: null
  })
  const [sectionForm, setSectionForm] = useState({
    number: '',
    name: '',
    text: ''
  })

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
    setExpandedNodes(prev => {
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
        // brief emphasis
        highlight.style.outline = '2px solid #3b82f6'
        setTimeout(() => { if (highlight) highlight.style.outline = 'none' }, 800)
      } else {
        // If highlight not found, scroll to the node itself
        const nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`)
        if (nodeElement) {
          (nodeElement as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' })
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

    setExpandedNodes(prev => {
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
        // The persistent blue highlight is now handled in applyRevisionHighlights
      } else {
        // If revision not found, scroll to the node itself
        const nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`)
        if (nodeElement) {
          (nodeElement as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [selectedRevision, nodeById])

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
    event.stopPropagation() // Prevent section expansion when clicking menu
    setOpenMenuId(openMenuId === nodeId ? null : nodeId)
  }

  const handleMenuAction = (action: string, nodeId: string) => {
    setOpenMenuId(null) // Close menu after action

    if (action === 'add-above' || action === 'add-below') {
      // Find the parent node and insertion index
      const parentNode = findParentNode(section, nodeId)
      if (parentNode) {
        const insertionIndex = action === 'add-above'
          ? parentNode.children?.findIndex(child => child.id === nodeId) || 0
          : (parentNode.children?.findIndex(child => child.id === nodeId) || 0) + 1

        setSectionModal({
          isOpen: true,
          targetParentId: parentNode.id,
          insertionIndex,
          action: action as 'add-above' | 'add-below'
        })
        setSectionForm({ number: '', name: '', text: '' })
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
    // Infer type based on parent - if parent is root, use 'body', otherwise inherit from parent
    if (parentNode.type === 'root') return 'body'
    return parentNode.type || 'body'
  }

  const inferSectionLevel = (parentNode: ContractSectionNode): number => {
    // Infer level based on parent - increment parent's level
    return (parentNode.level || 0) + 1
  }

  const handleSectionFormSubmit = () => {
    if (!sectionForm.number.trim()) {
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

    // Create the new section node
    const newSectionNode = {
      id: sectionForm.number.trim(), // Use number as ID
      type: sectionType,
      level: sectionLevel,
      number: sectionForm.number.trim(),
      name: sectionForm.name.trim() || undefined,
      markdown: sectionForm.text.trim() || `# ${sectionForm.number.trim()}${sectionForm.name.trim() ? ` - ${sectionForm.name.trim()}` : ''}\n\n[New section content]`,
      parent_id: sectionModal.targetParentId,
      children: []
    }

    onSectionAdd(sectionModal.targetParentId, sectionModal.insertionIndex, newSectionNode)

    // Close modal and reset form
    setSectionModal({ isOpen: false, targetParentId: '', insertionIndex: 0, action: null })
    setSectionForm({ number: '', name: '', text: '' })
  }

  const handleSectionFormCancel = () => {
    setSectionModal({ isOpen: false, targetParentId: '', insertionIndex: 0, action: null })
    setSectionForm({ number: '', name: '', text: '' })
  }

  const renderPendingSectionAdd = (sectionAdd: any, depth: number) => {
    const indentStyle = { marginLeft: `${depth * 20}px` }

    return (
      <div key={`pending-${sectionAdd.id}`} className="pending-section-node" data-section-add-id={sectionAdd.id} style={indentStyle}>
        <div
          className="pending-section-header"
          style={{
            padding: '8px 12px',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            marginBottom: '4px',
            backgroundColor: '#fef2f2',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            position: 'relative',
            cursor: 'pointer'
          }}
          onClick={() => {
            // Navigate to this pending section (scroll into view)
            const element = document.querySelector(`[data-section-add-id="${sectionAdd.id}"]`)
            element && (element as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          }}
        >
          {/* Placeholder expander (non-functional for pending sections) */}
          <div
            style={{
              width: '16px',
              height: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              color: '#dc2626',
              flexShrink: 0,
              marginTop: '2px'
            }}
          >
            +
          </div>
          <div className="pending-section-info" style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '4px'
            }}>
              <span style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#dc2626'
              }}>
                {sectionAdd.new_node?.number || 'New Section'}
              </span>
              <span style={{
                fontSize: '12px',
                color: '#dc2626',
                backgroundColor: '#fecaca',
                padding: '2px 6px',
                borderRadius: '4px'
              }}>
                PENDING
              </span>
            </div>
            <div style={{
              fontSize: '13px',
              color: '#dc2626',
              lineHeight: '1.4'
            }}>
              {sectionAdd.new_node?.markdown?.split('\n')[0]?.replace(/^#+\s*/, '') || sectionAdd.new_node?.name || 'New Section'}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const handleTextSelection = (nodeId: string, event: React.MouseEvent) => {
    // Prevent the click from bubbling up to the section header
    event.stopPropagation()

    // Use a small delay to ensure the selection is complete
    setTimeout(() => {
      const selection = window.getSelection()
      if (!selection || selection.toString().trim() === '') {
        return
      }

      const selectedText = selection.toString().trim()
      if (selectedText.length === 0) {
        return
      }

      // Find the markdown content container for this node
      const markdownContainer = (event.target as HTMLElement).closest('.section-markdown-inline')
      if (!markdownContainer) {
        return
      }

      // Calculate character offsets from the start of the markdown content
      const markdownText = markdownContainer.textContent || ''
      const selectedTextStart = markdownText.indexOf(selectedText)

      if (selectedTextStart === -1) {
        return
      }

      const offsetBeg = selectedTextStart
      const offsetEnd = selectedTextStart + selectedText.length

      // Show the annotation modal
      setAnnotationModal({
        isOpen: true,
        nodeId,
        offsetBeg,
        offsetEnd,
        selectedText,
        type: null
      })
    }, 10)
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
        annotationModal.selectedText, // old_text (anchor)
        content // new_text
      )
    }

    // Close modal
    setAnnotationModal({
      isOpen: false,
      nodeId: '',
      offsetBeg: 0,
      offsetEnd: 0,
      selectedText: '',
      type: null
    })
  }

  const getCommentsForNode = (nodeId: string): CommentAnnotation[] => annotations?.comments?.filter(c => c.node_id === nodeId) || []
  const getRevisionsForNode = (nodeId: string): RevisionAnnotation[] => annotations?.revisions?.filter(r => r.node_id === nodeId) || []
  const getPendingSectionAddsForParent = (parentId: string): any[] => annotations?.section_adds?.filter(s => s.target_parent_id === parentId && s.status === 'pending') || []

  const applyCommentHighlights = (container: HTMLElement, nodeId: string) => {
    const comments = getCommentsForNode(nodeId)
    if (!comments || comments.length === 0) return

    // Only highlight comments that are not resolved
    const activeComments = comments.filter(c => c.status !== 'resolved')
    if (activeComments.length === 0) return

    const ranges = activeComments
      .slice()
      .sort((a, b) => a.offset_beg - b.offset_beg)
      .map(c => ({ start: c.offset_beg, end: c.offset_end, id: c.id, selected: selectedComment?.id === c.id }))

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null)
    let globalOffset = 0
    let node: Node | null
    let rangeIdx = 0

    while ((node = walker.nextNode())) {
      const textNode = node as Text
      const text = textNode.nodeValue || ''
      const len = text.length
      if (len === 0) { continue }

      const nodeStart = globalOffset
      const nodeEnd = nodeStart + len

      // Advance rangeIdx past ranges that end before this node starts
      while (rangeIdx < ranges.length && ranges[rangeIdx].end <= nodeStart) rangeIdx++

      // Collect overlapping ranges for this node
      const overlaps: { start: number, end: number, id: string, selected: boolean }[] = []
      let k = rangeIdx
      while (k < ranges.length && ranges[k].start < nodeEnd) {
        overlaps.push(ranges[k])
        if (ranges[k].end <= nodeEnd) {
          k++
        } else {
          // this range continues into next node; do not advance further
          break
        }
      }

      if (overlaps.length === 0) {
        globalOffset += len
        continue
      }

      // Build replacement fragment for this text node
      const frag = document.createDocumentFragment()
      let localPos = 0
      overlaps.forEach(r => {
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

      // Advance globalOffset by original text length
      globalOffset += len

      // Advance rangeIdx past ranges fully consumed by this node
      while (rangeIdx < ranges.length && ranges[rangeIdx].end <= nodeEnd) rangeIdx++
    }
  }

  const applyRevisionHighlights = (container: HTMLElement, nodeId: string) => {
    const revisions = getRevisionsForNode(nodeId)
    if (!revisions || revisions.length === 0) return

    // Process pending, accepted, and rejected revisions (but not stale/conflict for now)
    const activeRevisions = revisions.filter(r => ['pending', 'accepted', 'rejected'].includes(r.status))
    if (activeRevisions.length === 0) return

    const ranges = activeRevisions
      .slice()
      .sort((a, b) => a.offset_beg - b.offset_beg)
      .map(r => ({ 
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
      if (len === 0) { continue }
      const nodeStart = globalOffset
      const nodeEnd = nodeStart + len
      while (rangeIdx < ranges.length && ranges[rangeIdx].end <= nodeStart) rangeIdx++

      const overlaps: typeof ranges = [] as any
      let k = rangeIdx
      while (k < ranges.length && ranges[k].start < nodeEnd) {
        overlaps.push(ranges[k])
        if (ranges[k].end <= nodeEnd) k++; else break
      }

      if (overlaps.length === 0) { globalOffset += len; continue }

      const frag = document.createDocumentFragment()
      let localPos = 0
      overlaps.forEach(r => {
        const localStart = Math.max(0, r.start - nodeStart)
        const localEnd = Math.min(len, r.end - nodeStart)
        if (localStart > localPos) frag.appendChild(document.createTextNode(text.slice(localPos, localStart)))

        if (r.status === 'pending') {
          // Pending: Strike-through old_text (red) + show new_text
          const del = document.createElement('del')
          del.className = 'revision-old'
          del.style.color = '#dc2626'
          del.setAttribute('data-revision-id', r.id)
          del.onclick = (e) => handleRevisionClick(r.id, e)
          del.textContent = text.slice(localStart, localEnd)
          
          // Add blue highlight box if this revision is selected
          if (r.selected) {
            del.style.backgroundColor = '#dbeafe'
            del.style.padding = '2px 4px'
            del.style.borderRadius = '4px'
            del.style.border = '2px solid #3b82f6'
          }
          
          frag.appendChild(del)

          // Insert suggested new_text once at the end of the revision span
          const isFinalSliceInThisNode = r.end <= nodeEnd
          if (isFinalSliceInThisNode && !insertedNewText.has(r.id)) {
            const ins = document.createElement('span')
            ins.className = 'revision-new'
            ins.style.color = '#059669'
            ins.setAttribute('data-revision-id', r.id)
            ins.onclick = (e) => handleRevisionClick(r.id, e)
            ins.textContent = r.new_text
            
            // Add blue highlight box if this revision is selected
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
          // Rejected: Show only old_text without strikethrough
          frag.appendChild(document.createTextNode(text.slice(localStart, localEnd)))
        } else if (r.status === 'accepted') {
          // Accepted: Show only new_text (no strikethrough)
          const isFinalSliceInThisNode = r.end <= nodeEnd
          if (isFinalSliceInThisNode && !insertedNewText.has(r.id)) {
            const span = document.createElement('span')
            span.className = 'revision-accepted'
            span.style.color = '#059669'
            span.setAttribute('data-revision-id', r.id)
            span.onclick = (e) => handleRevisionClick(r.id, e)
            span.textContent = r.new_text
            
            // Add blue highlight box if this revision is selected
            if (r.selected) {
              span.style.backgroundColor = '#dbeafe'
              span.style.padding = '2px 4px'
              span.style.borderRadius = '4px'
              span.style.border = '2px solid #3b82f6'
            }
            
            frag.appendChild(span)
            insertedNewText.add(r.id)
          }
          // Don't show old text for accepted revisions
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
    const comment = annotations?.comments?.find(c => c.id === commentId)
    if (comment && onCommentSelect) {
      onCommentSelect(comment)
    }
  }

  const handleRevisionClick = (revisionId: string, event: Event) => {
    event.stopPropagation?.()
    const rev = annotations?.revisions?.find(r => r.id === revisionId)
    if (rev && onRevisionSelect) onRevisionSelect(rev)
  }

  // Re-apply highlights when annotations or selection change
  useEffect(() => {
    const containers = Array.from(document.querySelectorAll('.section-node .section-markdown-inline')) as HTMLElement[]
    containers.forEach((markdownInline) => {
      const inner = markdownInline.firstElementChild as HTMLElement | null
      if (!inner) return

      // Get the original markdown text from data attribute
      const originalMarkdown = markdownInline.getAttribute('data-original-markdown') || ''
      if (!originalMarkdown) return

      // Reset to original plain text by clearing and re-rendering
      // We need to extract just the text content from the markdown
      // For simplicity, we'll use the current inner text on first render
      // and store it for subsequent renders
      if (!markdownInline.hasAttribute('data-original-text')) {
        markdownInline.setAttribute('data-original-text', inner.textContent || '')
      }

      const originalText = markdownInline.getAttribute('data-original-text') || ''

      // Clear all markup by replacing with plain text
      while (inner.firstChild) {
        inner.removeChild(inner.firstChild)
      }
      inner.appendChild(document.createTextNode(originalText))

      // Apply highlights to clean text
      const sectionNode = markdownInline.closest('.section-node') as HTMLElement | null
      const nodeId = sectionNode?.getAttribute('data-node-id') || ''
      if (nodeId) {
        // Apply revisions first, then comment highlights so highlights wrap revised text
        applyRevisionHighlights(inner, nodeId)
        applyCommentHighlights(inner, nodeId)
      }
    })
  }, [annotations, selectedComment, selectedRevision, expandedNodes])

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(nodeId)) {
        // If collapsing, remove this node and all its descendants
        newSet.delete(nodeId)
        const removeDescendants = (node: ContractSectionNode) => {
          if (node.children) {
            node.children.forEach(child => {
              newSet.delete(child.id)
              removeDescendants(child)
            })
          }
        }
        const findAndRemoveDescendants = (node: ContractSectionNode) => {
          if (node.id === nodeId) {
            removeDescendants(node)
          } else if (node.children) {
            node.children.forEach(child => findAndRemoveDescendants(child))
          }
        }
        findAndRemoveDescendants(section)
      } else {
        // If expanding, add this node and all its descendants
        newSet.add(nodeId)
        const addDescendants = (node: ContractSectionNode) => {
          if (node.children) {
            node.children.forEach(child => {
              newSet.add(child.id)
              addDescendants(child)
            })
          }
        }
        const findAndAddDescendants = (node: ContractSectionNode) => {
          if (node.id === nodeId) {
            addDescendants(node)
          } else if (node.children) {
            node.children.forEach(child => findAndAddDescendants(child))
          }
        }
        findAndAddDescendants(section)
      }
      return newSet
    })
  }

  const renderSectionNode = (node: ContractSectionNode, depth: number = 0) => {
    const isExpanded = expandedNodes.has(node.id)
    const hasChildren = node.children && node.children.length > 0
    const indentStyle = { marginLeft: `${depth * 20}px` }

    return (
      <div key={node.id} className="section-node" data-node-id={node.id} style={indentStyle}>
        <div
          className={`section-header ${isExpanded ? 'expanded' : ''}`}
          style={{
            padding: '8px 12px',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            marginBottom: '4px',
            backgroundColor: isExpanded ? '#f9fafb' : '#ffffff',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            transition: 'background-color 0.2s',
            position: 'relative'
          }}
        >
          {/* Always show expander - clickable area */}
          <div
            className="expand-icon"
            onClick={() => toggleNode(node.id)}
            style={{
              width: '16px',
              height: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              color: '#6b7280',
              transition: 'transform 0.2s',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              flexShrink: 0,
              marginTop: '2px',
              cursor: 'pointer'
            }}
          >
            ▶
          </div>
          <div className="section-info" style={{ flex: 1, minWidth: 0 }}>
            <div
              onClick={() => toggleNode(node.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: isExpanded && node.markdown ? '8px' : '0',
                cursor: 'pointer'
              }}
            >
              <span className="section-number" style={{
                fontWeight: '600',
                color: '#1f2937',
                fontSize: '14px',
                flexShrink: 0
              }}>
                {node.number}
              </span>
              {/* Only show section name for top-level sections when not expanded */}
              {node.name && (!isExpanded && node.level === 1) && (
                <span className="section-name" style={{
                  color: '#4b5563',
                  fontSize: '14px',
                  flexShrink: 0
                }}>
                  {decodeHtmlEntities(node.name)}
                </span>
              )}
              <span className="section-type" style={{
                padding: '2px 6px',
                backgroundColor: '#e5e7eb',
                borderRadius: '4px',
                fontSize: '12px',
                color: '#6b7280',
                textTransform: 'uppercase',
                flexShrink: 0
              }}>
                {node.type}
              </span>
            </div>

            {/* Show markdown content inline when expanded */}
            {isExpanded && node.markdown && (
              <div
                className="section-markdown-inline"
                data-original-markdown={node.markdown}
                style={{
                  fontSize: '14px',
                  lineHeight: '1.6',
                  color: '#374151',
                  userSelect: 'text',
                  cursor: 'text'
                }}
                onMouseUp={(e) => {
                  e.stopPropagation()

                  // Capture the container reference before setTimeout
                  const markdownContainer = e.currentTarget
                  if (!markdownContainer) {
                    console.log('No markdown container found')
                    return
                  }

                  // Small delay to ensure selection is complete
                  setTimeout(() => {
                    const selection = window.getSelection()

                    if (!selection || selection.toString().trim() === '') {
                      console.log('No selection found')
                      return
                    }

                    const selectedText = selection.toString().trim()

                    if (selectedText.length === 0) {
                      console.log('Selected text is empty')
                      return
                    }

                    // Ensure the selection is inside this markdown container
                    const range = selection.getRangeAt(0)
                    if (!markdownContainer.contains(range.startContainer) || !markdownContainer.contains(range.endContainer)) {
                      console.log('Selection is outside of this markdown container')
                      return
                    }

                    // Prefer computing offsets from the raw markdown to match backend exactly
                    let offsetBeg = node.markdown.indexOf(selectedText)
                    let offsetEnd = -1
                    if (offsetBeg !== -1) {
                      offsetEnd = offsetBeg + selectedText.length
                    } else {
                      // Fallback: compute offsets from rendered text if not found in raw
                      const preRange = document.createRange()
                      preRange.selectNodeContents(markdownContainer)
                      preRange.setEnd(range.startContainer, range.startOffset)
                      offsetBeg = preRange.toString().length
                      offsetEnd = offsetBeg + range.toString().length
                    }

                    const anchorText = node.markdown.slice(offsetBeg, offsetEnd)

                    console.log('Annotation modal:', { nodeId: node.id, offset_beg: offsetBeg, offset_end: offsetEnd, selected_text: anchorText })

                    // Show the annotation modal
                    setAnnotationModal({
                      isOpen: true,
                      nodeId: node.id,
                      offsetBeg,
                      offsetEnd,
                      selectedText: anchorText,
                      type: null
                    })
                  }, 50) // Increased delay to ensure selection is complete
                }}
              >
                <div>
                  <ReactMarkdown>{decodeHtmlEntities(node.markdown)}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>

          {/* Kebab menu */}
          <div
            className="section-menu"
            onClick={(e) => handleMenuToggle(node.id, e)}
            style={{
              position: 'relative',
              padding: '4px',
              cursor: 'pointer',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              flexShrink: 0,
              marginTop: '2px'
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ color: '#6b7280' }}
            >
              <circle cx="12" cy="12" r="1"/>
              <circle cx="12" cy="5" r="1"/>
              <circle cx="12" cy="19" r="1"/>
            </svg>

            {/* Dropdown menu */}
            {openMenuId === node.id && (
              <div
                className="section-menu-dropdown"
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: '0',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  zIndex: 1000,
                  minWidth: '160px',
                  padding: '4px 0'
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleMenuAction('add-above', node.id)
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    textAlign: 'left',
                    fontSize: '14px',
                    color: '#374151',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                  Add section above
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleMenuAction('add-below', node.id)
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    textAlign: 'left',
                    fontSize: '14px',
                    color: '#374151',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                  Add section below
                </button>
                <div style={{ height: '1px', backgroundColor: '#e5e7eb', margin: '4px 0' }} />
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleMenuAction('delete', node.id)
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    textAlign: 'left',
                    fontSize: '14px',
                    color: '#dc2626',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"/>
                  </svg>
                  Delete section
                </button>
              </div>
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="section-children" style={{ marginTop: '4px' }}>
            {(() => {
              // Get pending section additions for this parent
              const pendingAdds = getPendingSectionAddsForParent(node.id)

              // Create a combined list of children and pending additions
              const allChildren: Array<{ type: 'existing' | 'pending', data: any, index: number }> = []

              // Add existing children
              if (node.children) {
                node.children.forEach((child, index) => {
                  allChildren.push({ type: 'existing', data: child, index })
                })
              }

              // Add pending section additions at their insertion points
              pendingAdds.forEach(sectionAdd => {
                allChildren.push({ type: 'pending', data: sectionAdd, index: sectionAdd.insertion_index })
              })

              // Sort by index
              allChildren.sort((a, b) => a.index - b.index)

              // Render all children
              return allChildren.map((item, renderIndex) => {
                if (item.type === 'existing') {
                  return renderSectionNode(item.data, depth + 1)
                } else {
                  return renderPendingSectionAdd(item.data, depth + 1)
                }
              })
            })()}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="contract-section-tree" style={{
        maxHeight: '80vh',
        overflowY: 'auto',
        padding: '16px',
        backgroundColor: '#f8fafc',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        width: '100%',
        minWidth: 0
      }}>
        {section.children && section.children.map(child => renderSectionNode(child, 0))}
      </div>

      {/* Annotation Modal */}
      {annotationModal.isOpen && (
        <div className="annotation-modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <div className="annotation-modal" style={{
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
              Annotate Selected Text
            </h3>

            <div style={{ marginBottom: '16px' }}>
              <div style={{
                padding: '8px 12px',
                backgroundColor: '#f3f4f6',
                borderRadius: '4px',
                fontSize: '14px',
                fontStyle: 'italic',
                border: '1px solid #e5e7eb'
              }}>
                {decodeHtmlEntities(annotationModal.selectedText)}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <button
                onClick={() => setAnnotationModal(prev => ({ ...prev, type: 'comment' }))}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: annotationModal.type === 'comment' ? '#3b82f6' : '#ffffff',
                  color: annotationModal.type === 'comment' ? '#ffffff' : '#374151',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Add Comment
              </button>
              <button
                onClick={() => setAnnotationModal(prev => ({ ...prev, type: 'revision' }))}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: annotationModal.type === 'revision' ? '#3b82f6' : '#ffffff',
                  color: annotationModal.type === 'revision' ? '#ffffff' : '#374151',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Suggest Revision
              </button>
            </div>

            {annotationModal.type && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
                  {annotationModal.type === 'comment' ? 'Comment:' : 'Replacement text:'}
                </label>
                <textarea
                  id="annotation-content"
                  placeholder={annotationModal.type === 'comment'
                    ? 'Add your comment about the selected text...'
                    : 'Enter the replacement text...'}
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setAnnotationModal({
                  isOpen: false,
                  nodeId: '',
                  offsetBeg: 0,
                  offsetEnd: 0,
                  selectedText: '',
                  type: null
                })}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              {annotationModal.type && (
                <button
                  onClick={() => {
                    const textarea = document.getElementById('annotation-content') as HTMLTextAreaElement
                    const content = textarea?.value?.trim()
                    if (content) {
                      handleAnnotationSubmit(annotationModal.type!, content)
                    }
                  }}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: '#3b82f6',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  {annotationModal.type === 'comment' ? 'Add Comment' : 'Suggest Revision'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Section Add Modal */}
      {sectionModal.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
              Add New Section {sectionModal.action === 'add-above' ? 'Above' : 'Below'}
            </h3>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                Section Number *
              </label>
              <input
                type="text"
                value={sectionForm.number}
                onChange={(e) => setSectionForm(prev => ({ ...prev, number: e.target.value }))}
                placeholder="e.g., 1.1, 2.3, A.1"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                Section Name (Optional)
              </label>
              <input
                type="text"
                value={sectionForm.name}
                onChange={(e) => setSectionForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Definitions, Payment Terms"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                Section Text
              </label>
              <textarea
                value={sectionForm.text}
                onChange={(e) => setSectionForm(prev => ({ ...prev, text: e.target.value }))}
                placeholder="Enter the content for this section..."
                rows={6}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleSectionFormCancel}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSectionFormSubmit}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: '#3b82f6',
                  color: '#ffffff',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Add Section
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default ContractSectionTree
