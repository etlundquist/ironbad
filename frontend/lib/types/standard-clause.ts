export interface StandardClauseRule {
  id: string
  standard_clause_id: string
  severity: string
  title: string
  text: string
  created_at: string
  updated_at: string
}

export interface EditableRule {
  id?: string
  severity: string
  title: string
  text: string
  isNew?: boolean
  isDeleted?: boolean
}

export interface StandardClause {
  id: string
  name: string
  display_name: string
  description: string
  standard_text: string
  created_at: string
  updated_at: string
  rules?: StandardClauseRule[]
}

export interface StandardClauseFormData {
  name: string
  display_name: string
  description: string
  standard_text: string
}

