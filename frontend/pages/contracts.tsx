import { NextPage } from 'next'
import React, { useState, useEffect } from 'react'
import Link from 'next/link'

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

  useEffect(() => {
    fetchContracts()
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
        // Refresh contracts to get updated status
        await fetchContracts()
        alert('Contract analysis started successfully!')
      } else {
        const error = await response.text()
        alert(`Failed to start analysis: ${error}`)
      }
    } catch (error) {
      alert(`Network error: ${error}`)
    } finally {
      setAnalyzingContract(null)
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
      'Processing': 'status-processing',
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
      <div className="contracts-container">
        <div className="contracts-header">
          <h1>Contracts</h1>
          <p>Manage your contract documents</p>
        </div>
        <div className="loading-state">
          <div className="spinner large"></div>
          <p>Loading contracts...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="contracts-container">
        <div className="contracts-header">
          <h1>Contracts</h1>
          <p>Manage your contract documents</p>
        </div>
        <div className="error-state">
          <p>Error: {error}</p>
          <button onClick={fetchContracts} className="retry-button">
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="contracts-container">
      <div className="contracts-header">
        <h1>Contracts</h1>
        <p>Manage your contract documents</p>
        <div className="header-actions">
          <Link href="/upload" className="upload-contracts-link">
            + Upload New Contracts
          </Link>
        </div>
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
            {contracts.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-state">
                  <div className="empty-content">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14,2 14,8 20,8"/>
                    </svg>
                    <h3>No contracts found</h3>
                    <p>Upload your first contract to get started</p>
                  </div>
                </td>
              </tr>
            ) : (
              contracts.map((contract) => (
                <tr key={contract.id} className="contract-row">
                  <td className="contract-name">
                    <div className="file-info">
                      {getFileIcon(contract.filetype)}
                      <span className="filename">{contract.filename}</span>
                    </div>
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
                    <div className="action-buttons">
                      <Link href={`/contracts/${contract.id}`} className="action-button primary">
                        Open Contract
                      </Link>
                      {contract.status !== 'Processing' && (
                        <button
                          className="action-button secondary"
                          onClick={() => handleAnalyzeContract(contract.id)}
                          disabled={analyzingContract === contract.id}
                        >
                          {analyzingContract === contract.id ? (
                            <>
                              <div className="spinner small"></div>
                              Analyzing...
                            </>
                          ) : (
                            'Analyze Issues'
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ContractsPage
