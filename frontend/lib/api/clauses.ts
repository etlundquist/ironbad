import { StandardClause, ContractClause } from '../types'

const getBackendUrl = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

export async function fetchStandardClauses(): Promise<StandardClause[]> {
  const response = await fetch(`${getBackendUrl()}/standard_clauses`)
  if (!response.ok) throw new Error('Failed to fetch standard clauses')
  return response.json()
}

export async function fetchContractClauses(contractId: string): Promise<ContractClause[]> {
  const response = await fetch(`${getBackendUrl()}/contracts/${contractId}/clauses`)
  if (!response.ok) throw new Error('Failed to fetch contract clauses')
  return response.json()
}

