import React from 'react'
import Link from 'next/link'
import { Contract } from '../../lib/types'
import { getFileIcon, getStatusBadge, formatDate } from '../../lib/utils'
import { Spinner } from '../common/Spinner'

interface ContractListProps {
  contracts: Contract[]
  analyzingContract: string | null
  ingestingContract: string | null
  onIngest: (contractId: string) => void
  onAnalyze: (contractId: string) => void
  onDelete: (contractId: string) => void
}

export const ContractList: React.FC<ContractListProps> = ({
  contracts,
  analyzingContract,
  ingestingContract,
  onIngest,
  onAnalyze,
  onDelete
}) => {
  const getActionButtons = (contract: Contract) => {
    const isIngesting = ingestingContract === contract.id
    const isAnalyzing = analyzingContract === contract.id
    const showIngest = contract.status === 'Uploaded'
    const showAnalyze = contract.status === 'Ready for Review'

    const iconButtonStyle = {
      padding: '0.5rem',
      borderRadius: '6px',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      transition: 'all 0.2s',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative' as const
    }

    return (
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {showIngest && (
          <button
            onClick={() => onIngest(contract.id)}
            disabled={isIngesting}
            style={{ ...iconButtonStyle, color: isIngesting ? '#9ca3af' : '#2563eb', cursor: isIngesting ? 'not-allowed' : 'pointer' }}
            className="icon-button"
            title="Ingest Contract"
          >
            {isIngesting ? (
              <Spinner size="small" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              </svg>
            )}
          </button>
        )}

        {showAnalyze && (
          <button
            onClick={() => onAnalyze(contract.id)}
            disabled={isAnalyzing}
            style={{ ...iconButtonStyle, color: isAnalyzing ? '#9ca3af' : '#2563eb', cursor: isAnalyzing ? 'not-allowed' : 'pointer' }}
            className="icon-button"
            title="Analyze Contract"
          >
            {isAnalyzing ? (
              <Spinner size="small" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            )}
          </button>
        )}

        <Link href={`/contracts/${contract.id}`} style={{ ...iconButtonStyle, color: '#10b981' }} className="icon-button" title="Review Contract">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </Link>

        <Link href={`/review?contractId=${contract.id}`} style={{ ...iconButtonStyle, color: '#f59e0b' }} className="icon-button" title="Redline Contract">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
          </svg>
        </Link>

        <button
          onClick={() => {
            if (window.confirm(`Are you sure you want to delete "${contract.filename}"?`)) {
              onDelete(contract.id)
            }
          }}
          style={{ ...iconButtonStyle, color: '#ef4444' }}
          className="icon-button"
          title="Delete Contract"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="contracts-table-container">
      <table className="contracts-table">
        <thead>
          <tr>
            <th>Contract Name</th>
            <th>Status</th>
            <th>Date Uploaded</th>
            <th>Last Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((contract) => (
            <tr key={contract.id} className="contract-row">
              <td className="contract-name">
                <Link href={`/contracts/${contract.id}`} className="contract-name-link">
                  <div className="file-info">
                    {getFileIcon(contract.filetype)}
                    <span className="filename">{contract.filename}</span>
                  </div>
                </Link>
              </td>
              <td className="contract-status">
                {getStatusBadge(contract.status)}
              </td>
              <td className="contract-date">
                {formatDate(contract.created_at)}
              </td>
              <td className="contract-date">
                {formatDate(contract.updated_at)}
              </td>
              <td className="contract-actions">
                {getActionButtons(contract)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

