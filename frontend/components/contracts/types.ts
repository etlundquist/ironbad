// Type definitions for contract section tree components

export interface ContractSectionNode {
  id: string
  type: string
  level: number
  number: string
  name?: string
  markdown: string
  parent_id?: string
  children?: ContractSectionNode[]
}

export interface CommentAnnotation {
  id: string
  node_id: string
  offset_beg: number
  offset_end: number
  anchor_text: string
  comment_text: string
  status: string
  created_at: string
}

export interface RevisionAnnotation {
  id: string
  node_id: string
  offset_beg: number
  offset_end: number
  old_text: string
  new_text: string
  status: string
  created_at: string
}

export interface SectionAddAnnotation {
  id: string
  target_parent_id: string
  insertion_index: number
  new_node?: ContractSectionNode
  status: string
  created_at: string
}

export interface SectionRemoveAnnotation {
  id: string
  node_id: string
  status: string
  created_at: string
}

export interface ContractAnnotations {
  comments: CommentAnnotation[]
  revisions: RevisionAnnotation[]
  section_adds: SectionAddAnnotation[]
  section_removes: SectionRemoveAnnotation[]
}

export interface AnnotationModalState {
  isOpen: boolean
  nodeId: string
  offsetBeg: number
  offsetEnd: number
  selectedText: string
  type: 'comment' | 'revision' | null
}

export interface SectionModalState {
  isOpen: boolean
  targetParentId: string
  insertionIndex: number
  action: 'add-above' | 'add-below' | null
}

export interface SectionFormData {
  number: string
  name: string
  text: string
}

