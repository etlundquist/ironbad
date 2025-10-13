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
}

export const ContractList: React.FC<ContractListProps> = ({
  contracts,
  analyzingContract,
  ingestingContract,
  onIngest,
  onAnalyze
}) => {
  const getActionButton = (contract: Contract) => {
    const isIngesting = ingestingContract === contract.id
    const isAnalyzing = analyzingContract === contract.id

    switch (contract.status) {
      case 'Uploaded':
        return (
          <button
            onClick={() => onIngest(contract.id)}
            disabled={isIngesting}
            className="action-link primary"
            style={{
              background: '#2563eb',
              color: 'white',
              padding: '0.375rem 0.75rem',
              borderRadius: '6px',
              fontWeight: '500',
              border: 'none',
              cursor: isIngesting ? 'not-allowed' : 'pointer',
              opacity: isIngesting ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {isIngesting && <Spinner size="small" />}
            {isIngesting ? 'Ingesting...' : 'Ingest Contract'}
          </button>
        )

      case 'Ingesting':
        return (
          <div
            className="action-link"
            style={{
              background: '#f3f4f6',
              color: '#6b7280',
              padding: '0.375rem 0.75rem',
              borderRadius: '6px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'not-allowed'
            }}
          >
            <Spinner size="small" />
            Ingesting Contract
          </div>
        )

      case 'Analyzing':
        return (
          <div
            className="action-link"
            style={{
              background: '#f3f4f6',
              color: '#6b7280',
              padding: '0.375rem 0.75rem',
              borderRadius: '6px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'not-allowed'
            }}
          >
            <Spinner size="small" />
            Analyzing Contract
          </div>
        )

      case 'Ready for Review':
        return (
          <button
            onClick={() => onAnalyze(contract.id)}
            disabled={isAnalyzing}
            className="action-link primary"
            style={{
              background: '#2563eb',
              color: 'white',
              padding: '0.375rem 0.75rem',
              borderRadius: '6px',
              fontWeight: '500',
              border: 'none',
              cursor: isAnalyzing ? 'not-allowed' : 'pointer',
              opacity: isAnalyzing ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {isAnalyzing && <Spinner size="small" />}
            {isAnalyzing ? 'Analyzing...' : 'Analyze Contract'}
          </button>
        )

      case 'Under Review':
        return (
          <Link href={`/contracts/${contract.id}`} className="action-link primary">
            Review Contract
          </Link>
        )

      case 'Review Completed':
        return (
          <button
            onClick={() => {
              // Export functionality placeholder - could show toast but leaving as no-op for now
            }}
            className="action-link secondary"
            style={{
              background: '#6b7280',
              color: 'white',
              padding: '0.375rem 0.75rem',
              borderRadius: '6px',
              fontWeight: '500',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'none',
              display: 'inline-block'
            }}
          >
            Export Review Summary
          </button>
        )

      default:
        return (
          <Link href={`/contracts/${contract.id}`} className="action-link primary">
            View
          </Link>
        )
    }
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
                {getActionButton(contract)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

