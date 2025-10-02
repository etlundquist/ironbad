import { NextPage } from 'next'
import React, { useState, useEffect } from 'react'
import Link from 'next/link'

interface StandardClauseRule {
  id: string
  standard_clause_id: string
  severity: string
  title: string
  text: string
  created_at: string
  updated_at: string
}

interface EditableRule {
  id?: string
  severity: string
  title: string
  text: string
  isNew?: boolean
  isDeleted?: boolean
}

interface StandardClause {
  id: string
  name: string
  display_name: string
  description: string
  standard_text: string
  created_at: string
  updated_at: string
  rules?: StandardClauseRule[]
}

interface StandardClauseFormData {
  name: string
  display_name: string
  description: string
  standard_text: string
}

const StandardClausesPage: NextPage = () => {
  const [clauses, setClauses] = useState<StandardClause[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingClause, setEditingClause] = useState<string | null>(null)
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
    fetchClauses()
  }, [])

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showAddForm) {
        handleCancel()
      }
    }

    if (showAddForm) {
      document.addEventListener('keydown', handleEscKey)
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey)
      document.body.style.overflow = 'unset'
    }
  }, [showAddForm])

  const fetchClauses = async () => {
    try {
      setLoading(true)
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(`${backendUrl}/standard_clauses`)

      if (!response.ok) {
        throw new Error('Failed to fetch standard clauses')
      }

      const data = await response.json()
      setClauses(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const validateForm = (data: StandardClauseFormData): Partial<StandardClauseFormData> => {
    const errors: Partial<StandardClauseFormData> = {}

    if (!data.name.trim()) {
      errors.name = 'Clause ID is required'
    } else if (!/^[A-Z0-9_-]+$/i.test(data.name)) {
      errors.name = 'Clause ID must contain only letters, numbers, underscores, and dashes'
    }

    if (!data.display_name.trim()) {
      errors.display_name = 'Display name is required'
    }

    if (!data.description.trim()) {
      errors.description = 'Description is required'
    }

    if (!data.standard_text.trim()) {
      errors.standard_text = 'Standard text is required'
    }

    return errors
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))

    // Clear error when user starts typing
    if (formErrors[name as keyof StandardClauseFormData]) {
      setFormErrors(prev => ({ ...prev, [name]: undefined }))
    }
  }

  const handleAddNew = () => {
    setEditingClause(null)
    setFormData({
      name: '',
      display_name: '',
      description: '',
      standard_text: ''
    })
    setFormErrors({})
    setEditableRules([])
    setShowAddForm(true)
  }

  const handleEdit = (clause: StandardClause) => {
    setEditingClause(clause.id)
    setFormData({
      name: clause.name,
      display_name: clause.display_name,
      description: clause.description,
      standard_text: clause.standard_text
    })
    setFormErrors({})
    setEditableRules(clause.rules ? clause.rules.map(rule => ({
      id: rule.id,
      severity: rule.severity,
      title: rule.title,
      text: rule.text
    })) : [])
    setShowAddForm(true)
  }

  const handleCancel = () => {
    setShowAddForm(false)
    setEditingClause(null)
    setFormData({
      name: '',
      display_name: '',
      description: '',
      standard_text: ''
    })
    setFormErrors({})
    setEditableRules([])
  }

  const handleAddRule = () => {
    const newRule: EditableRule = {
      severity: 'info',
      title: '',
      text: '',
      isNew: true
    }
    setEditableRules([...editableRules, newRule])
  }

  const handleUpdateRule = (index: number, field: keyof EditableRule, value: string) => {
    const updatedRules = [...editableRules]
    updatedRules[index] = { ...updatedRules[index], [field]: value }
    setEditableRules(updatedRules)
  }

  const handleDeleteRule = (index: number) => {
    const rule = editableRules[index]
    if (rule.id) {
      // Mark existing rule as deleted
      const updatedRules = [...editableRules]
      updatedRules[index] = { ...updatedRules[index], isDeleted: true }
      setEditableRules(updatedRules)
    } else {
      // Remove new rule completely
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
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

      if (editingClause) {
        // Update existing clause
        const response = await fetch(`${backendUrl}/standard_clauses/${editingClause}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            display_name: formData.display_name,
            description: formData.description,
            standard_text: formData.standard_text
          })
        })

        if (!response.ok) {
          const error = await response.text()
          throw new Error(error)
        }

        // Handle rule updates
        const activeRules = editableRules.filter(rule => !rule.isDeleted)
        const newRules = activeRules.filter(rule => rule.isNew)
        const updatedRules = activeRules.filter(rule => rule.id && !rule.isNew)
        const deletedRules = editableRules.filter(rule => rule.isDeleted && rule.id)

        // Create new rules
        for (const rule of newRules) {
          await fetch(`${backendUrl}/standard_clause_rules`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              standard_clause_id: editingClause,
              severity: rule.severity,
              title: rule.title,
              text: rule.text
            })
          })
        }

        // Update existing rules
        for (const rule of updatedRules) {
          await fetch(`${backendUrl}/standard_clause_rules/${rule.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              severity: rule.severity,
              title: rule.title,
              text: rule.text
            })
          })
        }

        // Delete rules
        for (const rule of deletedRules) {
          await fetch(`${backendUrl}/standard_clause_rules/${rule.id}`, {
            method: 'DELETE'
          })
        }
      } else {
        // Create new clause
        const response = await fetch(`${backendUrl}/standard_clauses`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(formData)
        })

        if (!response.ok) {
          const error = await response.text()
          throw new Error(error)
        }

        const newClause = await response.json()

        // Create rules for new clause
        const activeRules = editableRules.filter(rule => !rule.isDeleted)
        for (const rule of activeRules) {
          await fetch(`${backendUrl}/standard_clause_rules`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              standard_clause_id: newClause.id,
              severity: rule.severity,
              title: rule.title,
              text: rule.text
            })
          })
        }
      }

      await fetchClauses()
      handleCancel()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (clauseId: string, clauseName: string) => {
    if (!confirm(`Are you sure you want to delete the standard clause "${clauseName}"? This action cannot be undone.`)) {
      return
    }

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(`${backendUrl}/standard_clauses/${clauseId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error)
      }

      await fetchClauses()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="page-container">
        <main className="main-content">
          <div className="loading-state">
            <div className="spinner large"></div>
            <p>Loading standard clauses...</p>
          </div>
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-container">
        <main className="main-content">
          <div className="error-state">
            <p>Error: {error}</p>
            <button onClick={fetchClauses} className="retry-button">
              Try Again
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="page-container">
      <main className="main-content">

      {/* Modal Overlay */}
      {showAddForm && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCancel()
            }
          }}
        >
          <div className="modal-content">
            <div style={{ padding: '1.5rem' }}>
              <div className="modal-header">
                <h3 className="modal-title">
                  {editingClause ? 'Edit Standard Clause' : 'Add New Standard Clause'}
                </h3>
                <button
                  onClick={handleCancel}
                  className="modal-close"
                >
                  ×
                </button>
              </div>

            <form onSubmit={handleSubmit} className="metadata-form">
              <div className="form-group">
                <label htmlFor="name">Clause ID</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className={`form-input ${formErrors.name ? 'error' : ''}`}
                  placeholder="e.g., termination"
                  disabled={!!editingClause}
                />
                {formErrors.name && <span style={{ color: '#dc2626', fontSize: '0.875rem' }}>{formErrors.name}</span>}
                {editingClause && (
                  <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                    Clause ID cannot be changed after creation
                  </span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="display_name">Display Name</label>
                <input
                  type="text"
                  id="display_name"
                  name="display_name"
                  value={formData.display_name}
                  onChange={handleInputChange}
                  className={`form-input ${formErrors.display_name ? 'error' : ''}`}
                  placeholder="e.g., Termination Clause"
                />
                {formErrors.display_name && <span style={{ color: '#dc2626', fontSize: '0.875rem' }}>{formErrors.display_name}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  className={`form-input ${formErrors.description ? 'error' : ''}`}
                  placeholder="Brief description of what this clause covers"
                  rows={3}
                />
                {formErrors.description && <span style={{ color: '#dc2626', fontSize: '0.875rem' }}>{formErrors.description}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="standard_text" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Standard Text
                  <div
                    className="info-tooltip"
                    style={{ position: 'relative', display: 'inline-block' }}
                    onMouseEnter={(e) => {
                      const tooltip = e.currentTarget.querySelector('.tooltip-content') as HTMLElement
                      if (tooltip) tooltip.style.opacity = '1'
                    }}
                    onMouseLeave={(e) => {
                      const tooltip = e.currentTarget.querySelector('.tooltip-content') as HTMLElement
                      if (tooltip) tooltip.style.opacity = '0'
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{ color: '#6b7280', cursor: 'help' }}
                    >
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                      <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <div className="tooltip-content" style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      marginBottom: '8px',
                      zIndex: 1000,
                      pointerEvents: 'none',
                      opacity: 0,
                      transition: 'opacity 0.2s ease',
                      whiteSpace: 'nowrap'
                    }}>
                      <div style={{
                        background: '#1f2937',
                        color: '#ffffff',
                        padding: '0.75rem 1rem',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        lineHeight: '1.4',
                        maxWidth: '300px',
                        wordWrap: 'break-word',
                        whiteSpace: 'normal',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}>
                        Provide your organization's standard clause text or pre-approved clause language to help generate suggested revisions during contract review.
                      </div>
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 0,
                        height: 0,
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderTop: '6px solid #1f2937'
                      }}></div>
                    </div>
                  </div>
                </label>
                <textarea
                  id="standard_text"
                  name="standard_text"
                  value={formData.standard_text}
                  onChange={handleInputChange}
                  className={`form-input ${formErrors.standard_text ? 'error' : ''}`}
                  placeholder="Your organization's standard or pre-approved clause text..."
                  rows={8}
                />
                {formErrors.standard_text && <span style={{ color: '#dc2626', fontSize: '0.875rem' }}>{formErrors.standard_text}</span>}
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Policy Rules
                  <div
                    className="info-tooltip"
                    style={{ position: 'relative', display: 'inline-block' }}
                    onMouseEnter={(e) => {
                      const tooltip = e.currentTarget.querySelector('.tooltip-content') as HTMLElement
                      if (tooltip) tooltip.style.opacity = '1'
                    }}
                    onMouseLeave={(e) => {
                      const tooltip = e.currentTarget.querySelector('.tooltip-content') as HTMLElement
                      if (tooltip) tooltip.style.opacity = '0'
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{ color: '#6b7280', cursor: 'help' }}
                    >
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                      <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <div className="tooltip-content" style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      marginBottom: '8px',
                      zIndex: 1000,
                      pointerEvents: 'none',
                      opacity: 0,
                      transition: 'opacity 0.2s ease',
                      whiteSpace: 'nowrap'
                    }}>
                      <div style={{
                        background: '#1f2937',
                        color: '#ffffff',
                        padding: '0.75rem 1rem',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        lineHeight: '1.4',
                        maxWidth: '300px',
                        wordWrap: 'break-word',
                        whiteSpace: 'normal',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}>
                        Provide your organization's policy rules to identify potential issues during contract review.
                      </div>
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 0,
                        height: 0,
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderTop: '6px solid #1f2937'
                      }}></div>
                    </div>
                  </div>
                </label>

                <div style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  background: '#ffffff',
                  marginTop: '0.5rem'
                }}>
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
                                  <select
                                    value={rule.severity}
                                    onChange={(e) => handleUpdateRule(index, 'severity', e.target.value)}
                                    style={{
                                      padding: '0.5rem',
                                      border: '1px solid #d1d5db',
                                      borderRadius: '4px',
                                      fontSize: '0.875rem',
                                      background: '#ffffff',
                                      color: getSeverityColor(rule.severity),
                                      fontWeight: '600'
                                    }}
                                  >
                                    <option value="info">Info</option>
                                    <option value="warning">Warning</option>
                                    <option value="critical">Critical</option>
                                  </select>
                                </td>
                                <td style={{ padding: '0.75rem', verticalAlign: 'top' }}>
                                  <input
                                    type="text"
                                    value={rule.title}
                                    onChange={(e) => handleUpdateRule(index, 'title', e.target.value)}
                                    placeholder="Rule title"
                                    style={{
                                      width: '100%',
                                      padding: '0.5rem',
                                      border: '1px solid #d1d5db',
                                      borderRadius: '4px',
                                      fontSize: '0.875rem'
                                    }}
                                  />
                                </td>
                                <td style={{ padding: '0.75rem', verticalAlign: 'top' }}>
                                  <textarea
                                    value={rule.text}
                                    onChange={(e) => handleUpdateRule(index, 'text', e.target.value)}
                                    placeholder="Rule description"
                                    rows={2}
                                    style={{
                                      width: '100%',
                                      padding: '0.5rem',
                                      border: '1px solid #d1d5db',
                                      borderRadius: '4px',
                                      fontSize: '0.875rem',
                                      resize: 'vertical'
                                    }}
                                  />
                                </td>
                                <td style={{ padding: '0.75rem', verticalAlign: 'top', textAlign: 'center' }}>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRule(index)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#dc2626',
                                      cursor: 'pointer',
                                      padding: '0.25rem',
                                      borderRadius: '4px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    }}
                                    title="Delete rule"
                                  >
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
                    <button
                      type="button"
                      onClick={handleAddRule}
                      className="cta-button secondary"
                      style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                    >
                      + Add Rule
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" onClick={handleCancel} className="cta-button secondary">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className="cta-button primary">
                  {isSubmitting ? 'Saving...' : (editingClause ? 'Update Clause' : 'Create Clause')}
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      <div className="contracts-table-container">
        <table className="contracts-table">
          <thead>
            <tr>
              <th>Clause ID</th>
              <th>Display Name</th>
              <th>Description</th>
              <th>Policy Rules</th>
              <th>Created</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {clauses.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state">
                  <div className="empty-content">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14,2 14,8 20,8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/>
                      <line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                    <h3>No standard clauses found</h3>
                    <p>Add your first standard clause to get started</p>
                  </div>
                </td>
              </tr>
            ) : (
              clauses.map((clause) => (
                <tr key={clause.id} className="contract-row">
                  <td className="contract-name">
                    <code style={{
                      background: '#f1f5f9',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.875rem',
                      color: '#475569'
                    }}>
                      {clause.name}
                    </code>
                  </td>
                  <td className="contract-name">
                    <strong>{clause.display_name}</strong>
                  </td>
                  <td className="contract-name">
                    <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                      {clause.description.length > 100
                        ? `${clause.description.substring(0, 100)}...`
                        : clause.description
                      }
                    </span>
                  </td>
                  <td className="contract-date">
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: '24px',
                      height: '24px',
                      background: clause.rules && clause.rules.length > 0 ? '#dbeafe' : '#f3f4f6',
                      color: clause.rules && clause.rules.length > 0 ? '#1e40af' : '#6b7280',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '600'
                    }}>
                      {clause.rules ? clause.rules.length : 0}
                    </span>
                  </td>
                  <td className="contract-date">
                    {formatDate(clause.created_at)}
                  </td>
                  <td className="contract-date">
                    {formatDate(clause.updated_at)}
                  </td>
                  <td className="contract-actions">
                    <div className="actions-group" role="group" aria-label="Clause actions">
                      <button
                        onClick={() => handleEdit(clause)}
                        className="action-link"
                        style={{ cursor: 'pointer', border: 'none', background: 'none' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(clause.id, clause.display_name)}
                        className="action-link"
                        style={{
                          cursor: 'pointer',
                          border: 'none',
                          background: 'none',
                          color: '#dc2626'
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'center',
        marginTop: '1.5rem'
      }}>
        <button onClick={handleAddNew} className="primary-button">
          + Add New Clause
        </button>
      </div>
      </main>
    </div>
  )
}

export default StandardClausesPage
