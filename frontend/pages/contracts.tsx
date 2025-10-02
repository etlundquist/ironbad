import { NextPage } from 'next'
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useNotificationContext } from '../components/NotificationProvider'

interface Contract {
  id: string
  status: string
  filename: string
  filetype: string
  created_at: string
  updated_at: string
}

const ContractsPage: NextPage = () => {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [analyzingContract, setAnalyzingContract] = useState<string | null>(null)
  const [ingestingContract, setIngestingContract] = useState<string | null>(null)
  const { isConnected } = useNotificationContext()

  useEffect(() => {
    fetchContracts()
  }, [])

  // Listen for contract status updates from notifications
  useEffect(() => {
    const handleContractStatusUpdate = (event: CustomEvent) => {
      console.log('Contracts page received contractStatusUpdate:', event.detail)
      const { contractId, status, jobType } = event.detail

      // Clear the loading state for the specific contract
      if (jobType === 'ingestion') {
        console.log('Clearing ingesting state for contract:', contractId)
        setIngestingContract(null)
      } else if (jobType === 'analysis') {
        console.log('Clearing analyzing state for contract:', contractId)
        setAnalyzingContract(null)
      }

      // Refresh contracts to get updated status
      console.log('Refreshing contracts after status update')
      fetchContracts()
    }

    window.addEventListener('contractStatusUpdate', handleContractStatusUpdate as EventListener)

    return () => {
      window.removeEventListener('contractStatusUpdate', handleContractStatusUpdate as EventListener)
    }
  }, [])

  const fetchContracts = async () => {
    try {
      setLoading(true)
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(`${backendUrl}/contracts`)

      if (!response.ok) {
        throw new Error('Failed to fetch contracts')
      }

      const data = await response.json()
      setContracts(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleIngestContract = async (contractId: string) => {
    setIngestingContract(contractId)
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(`${backendUrl}/contracts/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([contractId])
      })

      if (response.ok) {
        // Immediately refresh contracts to show INGESTING status
        await fetchContracts()
        // Don't clear ingestingContract here - let the notification handle it
      } else {
        const error = await response.text()
        alert(`Failed to start ingestion: ${error}`)
        setIngestingContract(null)
      }
    } catch (error) {
      alert(`Network error: ${error}`)
      setIngestingContract(null)
    }
  }

  const handleAnalyzeContract = async (contractId: string) => {
    setAnalyzingContract(contractId)
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(`${backendUrl}/contracts/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([contractId])
      })

      if (response.ok) {
        // Immediately refresh contracts to show ANALYZING status
        await fetchContracts()
        // Don't clear analyzingContract here - let the notification handle it
      } else {
        const error = await response.text()
        alert(`Failed to start analysis: ${error}`)
        setAnalyzingContract(null)
      }
    } catch (error) {
      alert(`Network error: ${error}`)
      setAnalyzingContract(null)
    }
  }

  const getActionButton = (contract: Contract) => {
    const isIngesting = ingestingContract === contract.id
    const isAnalyzing = analyzingContract === contract.id

    switch (contract.status) {
      case 'Uploaded':
        return (
          <button
            onClick={() => handleIngestContract(contract.id)}
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
            {isIngesting && <div className="spinner small"></div>}
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
            <div className="spinner small"></div>
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
            <div className="spinner small"></div>
            Analyzing Contract
          </div>
        )

      case 'Ready for Review':
        return (
          <button
            onClick={() => handleAnalyzeContract(contract.id)}
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
            {isAnalyzing && <div className="spinner small"></div>}
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
              // Placeholder for export functionality
              alert('Export functionality coming soon!')
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

  const getFileIcon = (filetype: string) => {
    if (filetype === 'application/pdf') {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="file-icon pdf">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10,9 9,9 8,9"/>
        </svg>
      )
    } else if (filetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="file-icon docx">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10,9 9,9 8,9"/>
        </svg>
      )
    }
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="file-icon unknown">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
      </svg>
    )
  }

  const getStatusBadge = (status: string) => {
    const statusClasses = {
      'Uploaded': 'status-uploaded',
      'Ingesting': 'status-ingesting',
      'Analyzing': 'status-analyzing',
      'Ready for Review': 'status-ready',
      'Under Review': 'status-review',
      'Review Completed': 'status-completed'
    }

    return (
      <span className={`status-badge ${statusClasses[status as keyof typeof statusClasses] || 'status-default'}`}>
        {status}
      </span>
    )
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="page-container">
        <main className="main-content">
          <div className="loading-state">
            <div className="spinner large"></div>
            <p>Loading contracts...</p>
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
            <button onClick={fetchContracts} className="retry-button">
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
        <div className="connection-status" style={{
          padding: '0.5rem 1rem',
          backgroundColor: isConnected ? '#d1fae5' : '#fef3c7',
          color: isConnected ? '#065f46' : '#92400e',
          borderRadius: '6px',
          marginBottom: '1rem',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          {isConnected ? (
            <>
              <div style={{ width: '8px', height: '8px', backgroundColor: '#10b981', borderRadius: '50%' }}></div>
              Connected to notifications
            </>
          ) : (
            <>
              <div className="spinner small"></div>
              Connecting to notifications...
            </>
          )}
        </div>
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

      {contracts.length === 0 ? (
        <div className="empty-state" style={{
          textAlign: 'center',
          padding: '3rem 2rem',
          backgroundColor: '#f8fafc',
          borderRadius: '8px',
          marginTop: '1.5rem'
        }}>
          <div className="empty-content">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: '#6b7280', marginBottom: '1rem' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
            </svg>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: '600', color: '#1e293b' }}>
              No contracts uploaded
            </h3>
            <p style={{ margin: '0 0 1.5rem 0', color: '#6b7280' }}>
              Please upload contracts to get started with contract review
            </p>
            <Link href="/upload" className="primary-button">
              Upload Contracts
            </Link>
          </div>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginTop: '1.5rem'
        }}>
          <Link href="/upload" className="upload-contracts-link">
            + Upload New Contracts
          </Link>
        </div>
      )}
      </main>
    </div>
  )
}

export default ContractsPage
