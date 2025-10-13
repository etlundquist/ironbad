import { ContractIssue } from '../types'

const getBackendUrl = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

export async function fetchContractIssues(contractId: string): Promise<ContractIssue[]> {
  const response = await fetch(`${getBackendUrl()}/contracts/${contractId}/issues`)
  if (!response.ok) throw new Error('Failed to fetch contract issues')
  return response.json()
}

export async function resolveIssue(contractId: string, issueId: string, resolution: 'ignore' | 'suggest_revision'): Promise<ContractIssue> {
  const response = await fetch(`${getBackendUrl()}/contracts/${contractId}/issues/${issueId}/resolve?resolution=${resolution}`, {
    method: 'POST'
  })

  if (!response.ok) throw new Error('Failed to resolve issue')
  return response.json()
}

export async function unresolveIssue(contractId: string, issueId: string): Promise<ContractIssue> {
  const response = await fetch(`${getBackendUrl()}/contracts/${contractId}/issues/${issueId}/unresolve`, {
    method: 'POST'
  })

  if (!response.ok) throw new Error('Failed to unresolve issue')
  return response.json()
}

export async function generateAIRevision(contractId: string, issueId: string): Promise<ContractIssue> {
  const response = await fetch(`${getBackendUrl()}/contracts/${contractId}/issues/${issueId}/ai-revision`, {
    method: 'PUT'
  })

  if (!response.ok) throw new Error('Failed to generate AI revision')
  return response.json()
}

export async function saveUserRevision(contractId: string, issueId: string, userSuggestedRevision: string): Promise<ContractIssue> {
  const response = await fetch(`${getBackendUrl()}/contracts/${contractId}/issues/${issueId}/user-revision`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_suggested_revision: userSuggestedRevision })
  })

  if (!response.ok) throw new Error('Failed to save user revision')
  return response.json()
}

