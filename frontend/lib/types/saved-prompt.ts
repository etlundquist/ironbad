export interface SavedPrompt {
  id: string
  name: string
  text: string
  variables: string[]
  created_at: string
  updated_at: string
}

export interface SavedPromptFormData {
  name: string
  text: string
  variables: string[]
}

