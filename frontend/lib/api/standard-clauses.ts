import { StandardClause, StandardClauseFormData, EditableRule } from '../types/standard-clause'

const getBackendUrl = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

export async function fetchStandardClausesWithRules(): Promise<StandardClause[]> {
  const response = await fetch(`${getBackendUrl()}/standard_clauses`)
  if (!response.ok) throw new Error('Failed to fetch standard clauses')
  return response.json()
}

export async function createStandardClause(data: StandardClauseFormData): Promise<StandardClause> {
  const response = await fetch(`${getBackendUrl()}/standard_clauses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(error)
  }

  return response.json()
}

export async function updateStandardClause(clauseId: string, data: Partial<StandardClauseFormData>): Promise<void> {
  const response = await fetch(`${getBackendUrl()}/standard_clauses/${clauseId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(error)
  }
}

export async function deleteStandardClause(clauseId: string): Promise<void> {
  const response = await fetch(`${getBackendUrl()}/standard_clauses/${clauseId}`, {
    method: 'DELETE'
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(error)
  }
}

export async function createStandardClauseRule(clauseId: string, rule: Omit<EditableRule, 'id' | 'isNew' | 'isDeleted'>): Promise<void> {
  await fetch(`${getBackendUrl()}/standard_clause_rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      standard_clause_id: clauseId,
      ...rule
    })
  })
}

export async function updateStandardClauseRule(ruleId: string, rule: Omit<EditableRule, 'id' | 'isNew' | 'isDeleted'>): Promise<void> {
  await fetch(`${getBackendUrl()}/standard_clause_rules/${ruleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule)
  })
}

export async function deleteStandardClauseRule(ruleId: string): Promise<void> {
  await fetch(`${getBackendUrl()}/standard_clause_rules/${ruleId}`, {
    method: 'DELETE'
  })
}

