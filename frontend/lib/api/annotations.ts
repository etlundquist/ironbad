import { ContractActionRequest, ContractActionResponse, AnnotationResolutionRequest, AnnotationResolutionResponse, AnnotationDeleteResponse } from '../types/annotation'

const getBackendUrl = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

export async function performContractAction(contractId: string, action: ContractActionRequest): Promise<ContractActionResponse> {
  const response = await fetch(`${getBackendUrl()}/contracts/${contractId}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.detail || 'Failed to perform contract action')
  }

  return response.json()
}

export async function resolveAnnotation(contractId: string, request: AnnotationResolutionRequest): Promise<AnnotationResolutionResponse> {
  const response = await fetch(`${getBackendUrl()}/contracts/${contractId}/annotations/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.detail || 'Failed to resolve annotation')
  }

  return response.json()
}

export async function deleteAnnotation(contractId: string, annotationId: string): Promise<AnnotationDeleteResponse> {
  const response = await fetch(`${getBackendUrl()}/contracts/${contractId}/annotations/${annotationId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.detail || 'Failed to delete annotation')
  }

  return response.json()
}

