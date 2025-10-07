import { NextPage } from 'next'
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useNotificationContext } from '../components/NotificationProvider'
import ContractSectionTree from '../components/ContractSectionTree'

interface Contract {
  id: string
  status: string
  filename: string
  filetype: string
  section_tree: any
  meta: any
  created_at: string
  updated_at: string
}

const ReviewPage: NextPage = () => {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { isConnected } = useNotificationContext()

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
      // Filter contracts that are ready for review or under review
      const reviewableContracts = data.filter((contract: Contract) =>
        contract.status === 'Ready for Review' ||
        contract.status === 'Under Review' ||
        contract.status === 'Review Completed'
      )
      setContracts(reviewableContracts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleContractSelect = (contract: Contract) => {
    setSelectedContract(contract)
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
        <div className="review-header">
          <h1>Review & Redline</h1>
          <p>Interactive contract review with comments, revisions, and section management</p>
        </div>

        {!selectedContract ? (
          <div className="contract-selection">
            <h2>Select a Contract to Review</h2>
            {contracts.length === 0 ? (
              <div className="empty-state">
                <p>No contracts available for review. Please ensure contracts are ingested and analyzed.</p>
                <Link href="/contracts" className="primary-button">
                  View All Contracts
                </Link>
              </div>
            ) : (
              <div className="contracts-table-container">
                <table className="contracts-table">
                  <thead>
                    <tr>
                      <th>Contract Name</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((contract) => (
                      <tr key={contract.id} className="contract-row" onClick={() => handleContractSelect(contract)}>
                        <td className="contract-name">
                          <div className="file-info">
                            {getFileIcon(contract.filetype)}
                            <span className="filename">{contract.filename}</span>
                          </div>
                        </td>
                        <td className="contract-status">
                          {getStatusBadge(contract.status)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="review-workspace">
            <div className="workspace-header">
              <div className="contract-info">
                <h2>{selectedContract.filename}</h2>
                {getStatusBadge(selectedContract.status)}
              </div>
              <div className="workspace-actions">
                <button onClick={() => setSelectedContract(null)} className="back-button">
                  Select Different Contract
                </button>
              </div>
            </div>

            <div className="workspace-content">
              <div className="contract-viewer">
                {selectedContract.section_tree ? (
                  <ContractSectionTree section={selectedContract.section_tree} />
                ) : (
                  <p>No section tree available for this contract.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default ReviewPage
