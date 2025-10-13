import React from 'react'
import { StandardClause } from '../../lib/types/standard-clause'
import { formatDate } from '../../lib/utils'

interface StandardClauseListProps {
  clauses: StandardClause[]
  onEdit: (clause: StandardClause) => void
  onDelete: (clauseId: string, clauseName: string) => void
}

export const StandardClauseList: React.FC<StandardClauseListProps> = ({ clauses, onEdit, onDelete }) => {
  return (
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
                  <code style={{ background: '#f1f5f9', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.875rem', color: '#475569' }}>
                    {clause.name}
                  </code>
                </td>
                <td className="contract-name">
                  <strong>{clause.display_name}</strong>
                </td>
                <td className="contract-name">
                  <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                    {clause.description.length > 100 ? `${clause.description.substring(0, 100)}...` : clause.description}
                  </span>
                </td>
                <td className="contract-date">
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '24px', height: '24px', background: clause.rules && clause.rules.length > 0 ? '#dbeafe' : '#f3f4f6', color: clause.rules && clause.rules.length > 0 ? '#1e40af' : '#6b7280', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600' }}>
                    {clause.rules ? clause.rules.length : 0}
                  </span>
                </td>
                <td className="contract-date">{formatDate(clause.created_at)}</td>
                <td className="contract-date">{formatDate(clause.updated_at)}</td>
                <td className="contract-actions">
                  <div className="actions-group" role="group" aria-label="Clause actions">
                    <button onClick={() => onEdit(clause)} className="action-link" style={{ cursor: 'pointer', border: 'none', background: 'none' }}>
                      Edit
                    </button>
                    <button onClick={() => onDelete(clause.id, clause.display_name)} className="action-link" style={{ cursor: 'pointer', border: 'none', background: 'none', color: '#dc2626' }}>
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

