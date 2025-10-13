import React, { useState, useEffect } from 'react'
import { StandardClause, StandardClauseFormData, EditableRule } from '../../lib/types/standard-clause'
import { createStandardClause, updateStandardClause, createStandardClauseRule, updateStandardClauseRule, deleteStandardClauseRule } from '../../lib/api/standard-clauses'
import { useNotificationContext } from '../common/NotificationProvider'

interface StandardClauseFormProps {
  editingClause: StandardClause | null
  onClose: () => void
  onSuccess: () => void
}

export const StandardClauseForm: React.FC<StandardClauseFormProps> = ({ editingClause, onClose, onSuccess }) => {
  const { showToast } = useNotificationContext()
  const [formData, setFormData] = useState<StandardClauseFormData>({
    name: '',
    display_name: '',
    description: '',
    standard_text: ''
  })
  const [formErrors, setFormErrors] = useState<Partial<StandardClauseFormData>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editableRules, setEditableRules] = useState<EditableRule[]>([])

  useEffect(() => {
    if (editingClause) {
      setFormData({
        name: editingClause.name,
        display_name: editingClause.display_name,
        description: editingClause.description,
        standard_text: editingClause.standard_text
      })
      setEditableRules(editingClause.rules ? editingClause.rules.map(rule => ({
        id: rule.id,
        severity: rule.severity,
        title: rule.title,
        text: rule.text
      })) : [])
    } else {
      setFormData({
        name: '',
        display_name: '',
        description: '',
        standard_text: ''
      })
      setEditableRules([])
    }
    setFormErrors({})
  }, [editingClause])

  const validateForm = (data: StandardClauseFormData): Partial<StandardClauseFormData> => {
    const errors: Partial<StandardClauseFormData> = {}

    if (!data.name.trim()) {
      errors.name = 'Clause ID is required'
    } else if (!/^[A-Z0-9_-]+$/i.test(data.name)) {
      errors.name = 'Clause ID must contain only letters, numbers, underscores, and dashes'
    }

    if (!data.display_name.trim()) errors.display_name = 'Display name is required'
    if (!data.description.trim()) errors.description = 'Description is required'
    if (!data.standard_text.trim()) errors.standard_text = 'Standard text is required'

    return errors
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (formErrors[name as keyof StandardClauseFormData]) {
      setFormErrors(prev => ({ ...prev, [name]: undefined }))
    }
  }

  const handleAddRule = () => {
    setEditableRules([...editableRules, { severity: 'info', title: '', text: '', isNew: true }])
  }

  const handleUpdateRule = (index: number, field: keyof EditableRule, value: string) => {
    const updatedRules = [...editableRules]
    updatedRules[index] = { ...updatedRules[index], [field]: value }
    setEditableRules(updatedRules)
  }

  const handleDeleteRule = (index: number) => {
    const rule = editableRules[index]
    if (rule.id) {
      const updatedRules = [...editableRules]
      updatedRules[index] = { ...updatedRules[index], isDeleted: true }
      setEditableRules(updatedRules)
    } else {
      setEditableRules(editableRules.filter((_, i) => i !== index))
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical': return '#dc2626'
      case 'warning': return '#d97706'
      case 'info': return '#2563eb'
      default: return '#6b7280'
    }
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
      if (editingClause) {
        await updateStandardClause(editingClause.id, {
          display_name: formData.display_name,
          description: formData.description,
          standard_text: formData.standard_text
        })

        const activeRules = editableRules.filter(rule => !rule.isDeleted)
        const newRules = activeRules.filter(rule => rule.isNew)
        const updatedRules = activeRules.filter(rule => rule.id && !rule.isNew)
        const deletedRules = editableRules.filter(rule => rule.isDeleted && rule.id)

        for (const rule of newRules) {
          await createStandardClauseRule(editingClause.id, { severity: rule.severity, title: rule.title, text: rule.text })
        }

        for (const rule of updatedRules) {
          await updateStandardClauseRule(rule.id!, { severity: rule.severity, title: rule.title, text: rule.text })
        }

        for (const rule of deletedRules) {
          await deleteStandardClauseRule(rule.id!)
        }
      } else {
        const newClause = await createStandardClause(formData)

        const activeRules = editableRules.filter(rule => !rule.isDeleted)
        for (const rule of activeRules) {
          await createStandardClauseRule(newClause.id, { severity: rule.severity, title: rule.title, text: rule.text })
        }
      }

      onSuccess()
      onClose()
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Error Saving Clause',
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
              {editingClause ? 'Edit Standard Clause' : 'Add New Standard Clause'}
            </h3>
            <button onClick={onClose} className="modal-close">×</button>
          </div>

          <form onSubmit={handleSubmit} className="metadata-form">
            <div className="form-group">
              <label htmlFor="name">Clause ID</label>
              <input type="text" id="name" name="name" value={formData.name} onChange={handleInputChange} className={`form-input ${formErrors.name ? 'error' : ''}`} placeholder="e.g., termination" disabled={!!editingClause} />
              {formErrors.name && <span style={{ color: '#dc2626', fontSize: '0.875rem' }}>{formErrors.name}</span>}
              {editingClause && <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>Clause ID cannot be changed after creation</span>}
            </div>

            <div className="form-group">
              <label htmlFor="display_name">Display Name</label>
              <input type="text" id="display_name" name="display_name" value={formData.display_name} onChange={handleInputChange} className={`form-input ${formErrors.display_name ? 'error' : ''}`} placeholder="e.g., Termination Clause" />
              {formErrors.display_name && <span style={{ color: '#dc2626', fontSize: '0.875rem' }}>{formErrors.display_name}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea id="description" name="description" value={formData.description} onChange={handleInputChange} className={`form-input ${formErrors.description ? 'error' : ''}`} placeholder="Brief description of what this clause covers" rows={3} />
              {formErrors.description && <span style={{ color: '#dc2626', fontSize: '0.875rem' }}>{formErrors.description}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="standard_text">Standard Text</label>
              <textarea id="standard_text" name="standard_text" value={formData.standard_text} onChange={handleInputChange} className={`form-input ${formErrors.standard_text ? 'error' : ''}`} placeholder="Your organization's standard or pre-approved clause text..." rows={8} />
              {formErrors.standard_text && <span style={{ color: '#dc2626', fontSize: '0.875rem' }}>{formErrors.standard_text}</span>}
            </div>

            <div className="form-group">
              <label>Policy Rules</label>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff', marginTop: '0.5rem' }}>
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {editableRules.filter(rule => !rule.isDeleted).length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                      <p style={{ margin: 0 }}>No rules defined. Click "Add Rule" to create one.</p>
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ background: '#f8fafc' }}>
                        <tr>
                          <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>Severity</th>
                          <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>Title</th>
                          <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>Text</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: '#374151', width: '80px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editableRules.map((rule, index) => {
                          if (rule.isDeleted) return null
                          return (
                            <tr key={index} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '0.75rem', verticalAlign: 'top' }}>
                                <select value={rule.severity} onChange={(e) => handleUpdateRule(index, 'severity', e.target.value)} style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.875rem', background: '#ffffff', color: getSeverityColor(rule.severity), fontWeight: '600' }}>
                                  <option value="info">Info</option>
                                  <option value="warning">Warning</option>
                                  <option value="critical">Critical</option>
                                </select>
                              </td>
                              <td style={{ padding: '0.75rem', verticalAlign: 'top' }}>
                                <input type="text" value={rule.title} onChange={(e) => handleUpdateRule(index, 'title', e.target.value)} placeholder="Rule title" style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.875rem' }} />
                              </td>
                              <td style={{ padding: '0.75rem', verticalAlign: 'top' }}>
                                <textarea value={rule.text} onChange={(e) => handleUpdateRule(index, 'text', e.target.value)} placeholder="Rule description" rows={2} style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.875rem', resize: 'vertical' }} />
                              </td>
                              <td style={{ padding: '0.75rem', verticalAlign: 'top', textAlign: 'center' }}>
                                <button type="button" onClick={() => handleDeleteRule(index)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '0.25rem', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Delete rule">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="3,6 5,6 21,6"/>
                                    <path d="M19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"/>
                                    <line x1="10" y1="11" x2="10" y2="17"/>
                                    <line x1="14" y1="11" x2="14" y2="17"/>
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                <div style={{ padding: '1rem', borderTop: '1px solid #e2e8f0' }}>
                  <button type="button" onClick={handleAddRule} className="cta-button secondary" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
                    + Add Rule
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} className="cta-button secondary">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="cta-button primary">
                {isSubmitting ? 'Saving...' : (editingClause ? 'Update Clause' : 'Create Clause')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

