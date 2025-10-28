import React from 'react'
import { SavedPrompt } from '../../lib/types/saved-prompt'
import { formatDate } from '../../lib/utils'

interface SavedPromptListProps {
  prompts: SavedPrompt[]
  onEdit: (prompt: SavedPrompt) => void
  onDelete: (promptId: string, promptName: string) => void
}

export const SavedPromptList: React.FC<SavedPromptListProps> = ({ prompts, onEdit, onDelete }) => {
  return (
    <div className="contracts-table-container">
      <table className="contracts-table">
        <thead>
          <tr>
            <th>Prompt Name</th>
            <th>Prompt Text</th>
            <th>Variables</th>
            <th>Created</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {prompts.length === 0 ? (
            <tr>
              <td colSpan={6} className="empty-state">
                <div className="empty-content">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                  <h3>No prompts found</h3>
                  <p>Add your first prompt to get started</p>
                </div>
              </td>
            </tr>
          ) : (
            prompts.map((prompt) => (
              <tr key={prompt.id} className="contract-row">
                <td className="contract-name">
                  <strong>{prompt.name}</strong>
                </td>
                <td className="contract-name">
                  <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                    {prompt.text.length > 100 ? `${prompt.text.substring(0, 100)}...` : prompt.text}
                  </span>
                </td>
                <td className="contract-date">
                  {prompt.variables.length > 0 ? (
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {prompt.variables.map((variable, idx) => (
                        <span key={idx} style={{ display: 'inline-block', padding: '0.125rem 0.5rem', background: '#f1f5f9', color: '#475569', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600' }}>
                          {`{{${variable}}}`}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>None</span>
                  )}
                </td>
                <td className="contract-date">{formatDate(prompt.created_at)}</td>
                <td className="contract-date">{formatDate(prompt.updated_at)}</td>
                <td className="contract-actions">
                  <div className="actions-group" role="group" aria-label="Prompt actions">
                    <button onClick={() => onEdit(prompt)} className="action-link" style={{ cursor: 'pointer', border: 'none', background: 'none' }}>
                      Edit
                    </button>
                    <button onClick={() => onDelete(prompt.id, prompt.name)} className="action-link" style={{ cursor: 'pointer', border: 'none', background: 'none', color: '#dc2626' }}>
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
  )
}

