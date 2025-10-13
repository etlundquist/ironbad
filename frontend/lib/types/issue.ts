import { StandardClause } from './clause'
import { ContractSectionCitation } from './contract'

export interface StandardClauseRule {
  id: string
  standard_clause_id: string
  severity: "Low" | "Medium" | "High" | "Critical"
  title: string
  text: string
  created_at: string
  updated_at: string
}

export interface ContractIssue {
  id: string
  standard_clause_id: string
  standard_clause_rule_id: string
  standard_clause?: StandardClause
  standard_clause_rule?: StandardClauseRule
  contract_id: string
  relevant_text: string
  explanation: string
  citations?: ContractSectionCitation[]
  status: "Open" | "Resolved"
  resolution?: 'ignore' | 'suggest_revision'
  ai_suggested_revision?: string
  user_suggested_revision?: string
  active_suggested_revision?: string
  created_at: string
  updated_at: string
}

