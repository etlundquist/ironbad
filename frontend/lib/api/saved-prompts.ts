import { SavedPrompt, SavedPromptFormData } from '../types/saved-prompt'

const getBackendUrl = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

export async function fetchSavedPrompts(): Promise<SavedPrompt[]> {
  const response = await fetch(`${getBackendUrl()}/saved_prompts`)
  if (!response.ok) throw new Error('Failed to fetch saved prompts')
  return response.json()
}

export async function createSavedPrompt(data: SavedPromptFormData): Promise<SavedPrompt> {
  const response = await fetch(`${getBackendUrl()}/saved_prompts`, {
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

export async function updateSavedPrompt(promptId: string, data: Partial<SavedPromptFormData>): Promise<void> {
  const response = await fetch(`${getBackendUrl()}/saved_prompts/${promptId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(error)
  }
}

export async function deleteSavedPrompt(promptId: string): Promise<void> {
  const response = await fetch(`${getBackendUrl()}/saved_prompts/${promptId}`, {
    method: 'DELETE'
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(error)
  }
}

