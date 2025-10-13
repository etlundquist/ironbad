import { NextPage } from 'next'
import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { useNotificationContext } from '../../components/common/NotificationProvider'
import { useContract } from '../../hooks/useContract'
import { ingestContracts, analyzeContracts } from '../../lib/api'
import { getFileIcon } from '../../lib/utils'
import { PDFViewer } from '../../components/contracts/PDFViewer'
import { MetadataForm } from '../../components/contracts/MetadataForm'
import { ClausesTab } from '../../components/contracts/ClausesTab'
import { IssuesTab } from '../../components/contracts/IssuesTab'
import { ChatTab } from '../../components/contracts/ChatTab'
import { Spinner } from '../../components/common/Spinner'

const ContractDetailPage: NextPage = () => {
  const router = useRouter()
  const { id, tab } = router.query
  const { contract, loading, error, refetch, setContract } = useContract(id)
  const [activeTab, setActiveTab] = useState('metadata')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const { isConnected, showToast } = useNotificationContext()

  // Resizable splitter state
  const [leftPanelWidth, setLeftPanelWidth] = useState(60)
  const [isDragging, setIsDragging] = useState(false)
  const splitterRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (typeof tab === 'string' && ['metadata','clauses','issues','chat'].includes(tab)) {
      setActiveTab(tab)
    }
  }, [tab])

  useEffect(() => {
    const handleContractStatusUpdate = (event: CustomEvent) => {
      const { contractId, status, jobType } = event.detail

      if (contractId === id) {
        if (jobType === 'analysis') {
          setIsAnalyzing(false)
        }
        refetch()
      }
    }

    window.addEventListener('contractStatusUpdate', handleContractStatusUpdate as EventListener)

    return () => {
      window.removeEventListener('contractStatusUpdate', handleContractStatusUpdate as EventListener)
    }
  }, [id, refetch])

  // Splitter drag handlers
  const handleSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleSplitterMouseMove = (e: MouseEvent) => {
    if (!isDragging) return

    const container = document.querySelector('.contract-detail-content') as HTMLElement
    if (!container) return

    const containerRect = container.getBoundingClientRect()
    const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100

    const constrainedWidth = Math.max(20, Math.min(80, newLeftWidth))
    setLeftPanelWidth(constrainedWidth)
  }

  const handleSplitterMouseUp = () => {
    setIsDragging(false)
  }

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleSplitterMouseMove)
      document.addEventListener('mouseup', handleSplitterMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    } else {
      document.removeEventListener('mousemove', handleSplitterMouseMove)
      document.removeEventListener('mouseup', handleSplitterMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    return () => {
      document.removeEventListener('mousemove', handleSplitterMouseMove)
      document.removeEventListener('mouseup', handleSplitterMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging])

  const handleIngestContract = async () => {
    if (!contract) return

    setIsAnalyzing(true)
    try {
      await ingestContracts([contract.id])
      await refetch()
      showToast({
        type: 'success',
        title: 'Ingestion Started',
        message: 'Contract ingestion started successfully!'
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Ingestion Failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleAnalyzeIssues = async () => {
    if (!contract) return

    setIsAnalyzing(true)
    try {
      await analyzeContracts([contract.id])
      await refetch()
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Analysis Failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
      setIsAnalyzing(false)
    }
  }

  const navigateToPage = (page: number) => {
    const anchor = document.getElementById(`pdf-page-${page}`)
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  if (loading) {
    return (
      <div className="contract-detail-container">
        <div className="loading-state">
          <Spinner size="large" />
          <p>Loading contract...</p>
        </div>
      </div>
    )
  }

  if (error || !contract) {
    return (
      <div className="contract-detail-container">
        <div className="error-state">
          <p>Error: {error || 'Contract not found'}</p>
          <Link href="/contracts" className="retry-button">
            Back to Contracts
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="contract-detail-container">
      <div className="contract-detail-header">
        <div className="header-left">
          <Link href="/contracts" className="back-link">
            ← Back to Contracts
          </Link>
          <div className="contract-title">
            {getFileIcon(contract.filetype)}
            <h1>{contract.filename}</h1>
          </div>
        </div>
      </div>

      <div className="contract-detail-content">
        <div
          className="pdf-viewer-container"
          style={{ width: `${leftPanelWidth}%` }}
        >
          <PDFViewer contract={contract} />
        </div>

        <div
          ref={splitterRef}
          className="resizable-splitter"
          onMouseDown={handleSplitterMouseDown}
        />

        <div
          className="contract-detail-sidebar"
          style={{ width: `${100 - leftPanelWidth}%` }}
        >
          <div className="tabs-container">
            <div className="tabs-header">
              <button
                className={`tab-button ${activeTab === 'metadata' ? 'active' : ''}`}
                onClick={() => setActiveTab('metadata')}
              >
                Contract Metadata
              </button>
              <button
                className={`tab-button ${activeTab === 'clauses' ? 'active' : ''}`}
                onClick={() => setActiveTab('clauses')}
              >
                Extracted Clauses
              </button>
              <button
                className={`tab-button ${activeTab === 'issues' ? 'active' : ''}`}
                onClick={() => setActiveTab('issues')}
              >
                Identified Issues
              </button>
              <button
                className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`}
                onClick={() => setActiveTab('chat')}
              >
                Contract Chat
              </button>
            </div>
            <div className="tab-content">
              {activeTab === 'metadata' && (
                <MetadataForm
                  contract={contract}
                  onContractUpdate={setContract}
                  isAnalyzing={isAnalyzing}
                  onIngest={handleIngestContract}
                />
              )}
              {activeTab === 'clauses' && (
                <ClausesTab
                  contract={contract}
                  isAnalyzing={isAnalyzing}
                  onIngest={handleIngestContract}
                />
              )}
              {activeTab === 'issues' && (
                <IssuesTab
                  contract={contract}
                  isAnalyzing={isAnalyzing}
                  onAnalyze={handleAnalyzeIssues}
                  onContractUpdate={setContract}
                  navigateToPage={navigateToPage}
                />
              )}
              {activeTab === 'chat' && (
                <ChatTab
                  contract={contract}
                  contractId={id as string}
                  isAnalyzing={isAnalyzing}
                  onIngest={handleIngestContract}
                  navigateToPage={navigateToPage}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ContractDetailPage
