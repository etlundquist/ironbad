import React, { useState, useEffect } from 'react'
import { SavedPrompt, SavedPromptFormData } from '../../lib/types/saved-prompt'
import { createSavedPrompt, updateSavedPrompt } from '../../lib/api/saved-prompts'
import { useNotificationContext } from '../common/NotificationProvider'

interface SavedPromptFormProps {
  editingPrompt: SavedPrompt | null
  onClose: () => void
  onSuccess: () => void
}

export const SavedPromptForm: React.FC<SavedPromptFormProps> = ({ editingPrompt, onClose, onSuccess }) => {
  const { showToast } = useNotificationContext()
  const [formData, setFormData] = useState<SavedPromptFormData>({
    name: '',
    text: '',
    variables: []
  })
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof SavedPromptFormData, string>>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [detectedVariables, setDetectedVariables] = useState<string[]>([])

  useEffect(() => {
    if (editingPrompt) {
      setFormData({
        name: editingPrompt.name,
        text: editingPrompt.text,
        variables: editingPrompt.variables
      })
    } else {
      setFormData({
        name: '',
        text: '',
        variables: []
      })
    }
    setFormErrors({})
  }, [editingPrompt])

  useEffect(() => {
    const variableRegex = /\{\{\s*(\w+)\s*\}\}/g
    const matches = [...formData.text.matchAll(variableRegex)]
    const uniqueVariables = [...new Set(matches.map(match => match[1]))]
    setDetectedVariables(uniqueVariables)
  }, [formData.text])

  const validateForm = (data: SavedPromptFormData): Partial<Record<keyof SavedPromptFormData, string>> => {
    const errors: Partial<Record<keyof SavedPromptFormData, string>> = {}

    if (!data.name.trim()) {
      errors.name = 'Prompt name is required'
    }

    if (!data.text.trim()) {
      errors.text = 'Prompt text is required'
    }

    const variableSet = new Set(data.variables)
    const detectedSet = new Set(detectedVariables)
    
    if (variableSet.size !== detectedSet.size || [...variableSet].some(v => !detectedSet.has(v))) {
      errors.variables = 'Variables list must match the variables in the prompt text'
    }

    return errors
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (formErrors[name as keyof SavedPromptFormData]) {
      setFormErrors(prev => ({ ...prev, [name]: undefined }))
    }
  }

  const syncVariables = () => {
    setFormData(prev => ({ ...prev, variables: detectedVariables }))
    setFormErrors(prev => ({ ...prev, variables: undefined }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const errors = validateForm(formData)
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    setIsSubmitting(true)
    try {
      if (editingPrompt) {
        await updateSavedPrompt(editingPrompt.id, formData)
      } else {
        await createSavedPrompt(formData)
      }

      onSuccess()
      onClose()
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Error Saving Prompt',
        message: err instanceof Error ? err.message : 'An error occurred'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-content">
        <div style={{ padding: '1.5rem' }}>
          <div className="modal-header">
            <h3 className="modal-title">
              {editingPrompt ? 'Edit Prompt' : 'Add New Prompt'}
            </h3>
            <button onClick={onClose} className="modal-close">×</button>
          </div>

          <form onSubmit={handleSubmit} className="metadata-form">
            <div className="form-group">
              <label htmlFor="name">Prompt Name</label>
              <input type="text" id="name" name="name" value={formData.name} onChange={handleInputChange} className={`form-input ${formErrors.name ? 'error' : ''}`} placeholder="e.g., Request Liability Cap" />
              {formErrors.name && <span style={{ color: '#dc2626', fontSize: '0.875rem' }}>{formErrors.name}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="text">Prompt Text</label>
              <textarea id="text" name="text" value={formData.text} onChange={handleInputChange} className={`form-input ${formErrors.text ? 'error' : ''}`} placeholder="Enter your prompt text with variables like {{ variable_name }}" rows={8} />
              {formErrors.text && <span style={{ color: '#dc2626', fontSize: '0.875rem' }}>{formErrors.text}</span>}
              <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                Use {`{{ variable_name }}`} syntax to define variables that will be resolved when the prompt is used.
              </span>
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <label style={{ margin: 0 }}>Detected Variables</label>
                {detectedVariables.length > 0 && (
                  <button type="button" onClick={syncVariables} className="cta-button secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}>
                    Sync Variables
                  </button>
                )}
              </div>
              
              {detectedVariables.length === 0 ? (
                <div style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f9fafb', color: '#6b7280', fontSize: '0.875rem', textAlign: 'center' }}>
                  No variables detected in prompt text
                </div>
              ) : (
                <div style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f9fafb' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {detectedVariables.map((variable, idx) => (
                      <span key={idx} style={{ display: 'inline-block', padding: '0.25rem 0.75rem', background: '#dbeafe', color: '#1e40af', borderRadius: '4px', fontSize: '0.875rem', fontWeight: '600' }}>
                        {`{{${variable}}}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {formErrors.variables && (
                <span style={{ color: '#dc2626', fontSize: '0.875rem', display: 'block', marginTop: '0.5rem' }}>
                  {formErrors.variables}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} className="cta-button secondary">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="cta-button primary">
                {isSubmitting ? 'Saving...' : (editingPrompt ? 'Update Prompt' : 'Create Prompt')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

