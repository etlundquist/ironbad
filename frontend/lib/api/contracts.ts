import { Contract, ContractMetadata } from '../types'

const getBackendUrl = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

export async function fetchContracts(): Promise<Contract[]> {
  const response = await fetch(`${getBackendUrl()}/contracts`)
  if (!response.ok) throw new Error('Failed to fetch contracts')
  return response.json()
}

export async function fetchContract(id: string): Promise<Contract> {
  const response = await fetch(`${getBackendUrl()}/contracts/${id}`)
  if (!response.ok) throw new Error('Failed to fetch contract')
  return response.json()
}

export async function uploadContract(file: File): Promise<Contract> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${getBackendUrl()}/contracts`, {
    method: 'POST',
    body: formData
  })

  if (!response.ok) throw new Error('Failed to upload contract')
  return response.json()
}

export async function updateContractMetadata(contractId: string, metadata: ContractMetadata): Promise<Contract> {
  const response = await fetch(`${getBackendUrl()}/contracts/${contractId}/metadata`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata)
  })

  if (!response.ok) throw new Error('Failed to update metadata')
  return response.json()
}

export async function ingestContracts(contractIds: string[]): Promise<void> {
  const response = await fetch(`${getBackendUrl()}/contracts/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contractIds)
  })

  if (!response.ok) throw new Error('Failed to start ingestion')
}

export async function analyzeContracts(contractIds: string[]): Promise<void> {
  const response = await fetch(`${getBackendUrl()}/contracts/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contractIds)
  })

  if (!response.ok) throw new Error('Failed to start analysis')
}

export async function updateContractStatus(contractId: string, status: string): Promise<Contract> {
  const response = await fetch(`${getBackendUrl()}/contracts/${contractId}/status?status=${encodeURIComponent(status)}`, {
    method: 'PUT'
  })

  if (!response.ok) throw new Error('Failed to update contract status')
  return response.json()
}

export function getContractContentUrl(contractId: string): string {
  return `${getBackendUrl()}/contracts/${contractId}/contents`
}

