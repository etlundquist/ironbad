import { NextPage } from 'next'
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useNotificationContext } from '../components/common/NotificationProvider'
import { Contract } from '../lib/types'
import { fetchContracts, ingestContracts, analyzeContracts, deleteContract } from '../lib/api'
import { ContractList } from '../components/contracts/ContractList'
import { Spinner } from '../components/common/Spinner'

const ContractsPage: NextPage = () => {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [analyzingContract, setAnalyzingContract] = useState<string | null>(null)
  const [ingestingContract, setIngestingContract] = useState<string | null>(null)
  const { isConnected, showToast } = useNotificationContext()

  const loadContracts = async () => {
    try {
      setLoading(true)
      const data = await fetchContracts()
      setContracts(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadContracts()
  }, [])

  useEffect(() => {
    const handleContractStatusUpdate = (event: CustomEvent) => {
      const { contractId, jobType } = event.detail

      if (jobType === 'ingestion') {
        setIngestingContract(null)
      } else if (jobType === 'analysis') {
        setAnalyzingContract(null)
      }

      loadContracts()
    }

    window.addEventListener('contractStatusUpdate', handleContractStatusUpdate as EventListener)

    return () => {
      window.removeEventListener('contractStatusUpdate', handleContractStatusUpdate as EventListener)
    }
  }, [])

  const handleIngestContract = async (contractId: string) => {
    setIngestingContract(contractId)
    try {
      await ingestContracts([contractId])
      await loadContracts()
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Ingestion Failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
      setIngestingContract(null)
    }
  }

  const handleAnalyzeContract = async (contractId: string) => {
    setAnalyzingContract(contractId)
    try {
      await analyzeContracts([contractId])
      await loadContracts()
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Analysis Failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
      setAnalyzingContract(null)
    }
  }

  const handleDeleteContract = async (contractId: string) => {
    try {
      await deleteContract(contractId)
      showToast({
        type: 'success',
        title: 'Contract Deleted',
        message: 'Contract has been successfully deleted'
      })
      await loadContracts()
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Deletion Failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  if (loading) {
    return (
      <div className="page-container">
        <main className="main-content">
          <div className="loading-state">
            <Spinner size="large" />
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
            <button onClick={loadContracts} className="retry-button">
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
              <Spinner size="small" />
              Connecting to notifications...
            </>
          )}
        </div>

        <ContractList
          contracts={contracts}
          analyzingContract={analyzingContract}
          ingestingContract={ingestingContract}
          onIngest={handleIngestContract}
          onAnalyze={handleAnalyzeContract}
          onDelete={handleDeleteContract}
        />

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
