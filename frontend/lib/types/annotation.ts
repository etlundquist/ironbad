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
  new_node: any
  status: string
  created_at: string
  resolved_at?: string
}

export interface SectionRemoveAnnotation {
  id: string
  node_id: string
  status: string
  created_at: string
  resolved_at?: string
}

export interface ContractAnnotations {
  comments: CommentAnnotation[]
  revisions: RevisionAnnotation[]
  section_adds: SectionAddAnnotation[]
  section_removes: SectionRemoveAnnotation[]
}

export interface ContractWithAnnotations {
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

export interface ContractActionRequest {
  action: 'make_comment' | 'edit_comment' | 'make_revision' | 'edit_revision' | 'section_add' | 'section_remove'
  data: any
}

export interface ContractActionResponse {
  status: 'applied' | 'rejected' | 'conflict'
  action: string
  action_id: string
  new_contract_version: number
  updated_annotations: ContractAnnotations
}

export interface AnnotationResolutionRequest {
  annotation_id: string
  annotation_type: 'comment' | 'revision' | 'section_add' | 'section_remove'
  resolution: 'accepted' | 'rejected' | 'resolved'
}

export interface AnnotationResolutionResponse {
  status: 'applied' | 'rejected' | 'conflict'
  annotation_id: string
  annotation_type: string
  resolution: string
  new_contract_version: number
  updated_annotations: ContractAnnotations
  updated_nodes?: any[]
  rebased_annotations?: ContractAnnotations
}

export interface AnnotationDeleteResponse {
  status: 'applied' | 'rejected' | 'conflict'
  annotation_id: string
  new_contract_version: number
  updated_annotations: ContractAnnotations
}

