export interface StandardClause {
  id: string
  name: string
  display_name: string
  description: string
  standard_text: string
  created_at: string
  updated_at: string
}

export interface ContractClause {
  id: string
  standard_clause_id: string
  standard_clause?: StandardClause
  contract_id: string
  contract_sections: string[]
  raw_markdown: string
  cleaned_markdown: string
  created_at: string
  updated_at: string
}

