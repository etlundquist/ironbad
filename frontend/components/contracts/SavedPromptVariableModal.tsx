import React, { useState, useEffect } from 'react'
import { SavedPrompt } from '../../lib/types/saved-prompt'

interface SavedPromptVariableModalProps {
  prompt: SavedPrompt
  onClose: () => void
  onSubmit: (resolvedText: string) => void
}

export const SavedPromptVariableModal: React.FC<SavedPromptVariableModalProps> = ({ prompt, onClose, onSubmit }) => {
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    // Initialize variable values
    const initialValues: Record<string, string> = {}
    prompt.variables.forEach(variable => {
      initialValues[variable] = ''
    })
    setVariableValues(initialValues)
  }, [prompt])

  const handleVariableChange = (variable: string, value: string) => {
    setVariableValues(prev => ({ ...prev, [variable]: value }))
    if (errors[variable]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[variable]
        return newErrors
      })
    }
  }

  const handleSubmit = () => {
    // Validate all variables are filled
    const newErrors: Record<string, string> = {}
    prompt.variables.forEach(variable => {
      if (!variableValues[variable]?.trim()) {
        newErrors[variable] = 'This field is required'
      }
    })

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    // Resolve the prompt text by replacing variables
    let resolvedText = prompt.text
    prompt.variables.forEach(variable => {
      const regex = new RegExp(`\\{\\{\\s*${variable}\\s*\\}\\}`, 'g')
      resolvedText = resolvedText.replace(regex, variableValues[variable])
    })

    onSubmit(resolvedText)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <div style={{ padding: '1.5rem' }}>
          <div className="modal-header">
            <h3 className="modal-title">Fill Prompt Variables</h3>
            <button onClick={onClose} className="modal-close">×</button>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Prompt: {prompt.name}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#374151', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                {prompt.text}
              </div>
            </div>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }} className="metadata-form">
            {prompt.variables.map((variable) => (
              <div key={variable} className="form-group">
                <label htmlFor={variable} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <code style={{ background: '#dbeafe', padding: '0.125rem 0.5rem', borderRadius: '4px', fontSize: '0.875rem', fontWeight: '600', color: '#1e40af' }}>
                    {`{{${variable}}}`}
                  </code>
                </label>
                <input
                  type="text"
                  id={variable}
                  value={variableValues[variable] || ''}
                  onChange={(e) => handleVariableChange(variable, e.target.value)}
                  className={`form-input ${errors[variable] ? 'error' : ''}`}
                  placeholder={`Enter value for ${variable}`}
                />
                {errors[variable] && (
                  <span style={{ color: '#dc2626', fontSize: '0.875rem' }}>{errors[variable]}</span>
                )}
              </div>
            ))}

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button type="button" onClick={onClose} className="cta-button secondary">
                Cancel
              </button>
              <button type="submit" className="cta-button primary">
                Use Prompt
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

