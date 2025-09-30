import { NextPage } from 'next'
import React, { useState, useCallback, useRef } from 'react'
import Link from 'next/link'

interface UploadedContract {
  id: string
  contractId?: string  // UUID from backend response
  filename: string
  status: 'uploading' | 'success' | 'error'
  error?: string
}

const UploadPage: NextPage = () => {
  const [uploadedContracts, setUploadedContracts] = useState<UploadedContract[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isIngesting, setIsIngesting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = useCallback(async (files: FileList) => {
    const fileArray = Array.from(files).filter(file =>
      file.type === 'application/pdf' ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )

    if (fileArray.length === 0) {
      alert('Please select PDF or DOCX files only.')
      return
    }

    // Add files to state with uploading status
    const newContracts: UploadedContract[] = fileArray.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      filename: file.name,
      status: 'uploading'
    }))

    setUploadedContracts((prev: UploadedContract[]) => [...prev, ...newContracts])

    // Upload each file
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i]
      const contractId = newContracts[i].id

      try {
        const formData = new FormData()
        formData.append('file', file)

        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
        const response = await fetch(`${backendUrl}/contracts`, {
          method: 'POST',
          body: formData
        })

        if (response.ok) {
          const contract = await response.json()
          setUploadedContracts((prev: UploadedContract[]) =>
            prev.map((c: UploadedContract) =>
              c.id === contractId
                ? { ...c, status: 'success' as const, contractId: contract.id }
                : c
            )
          )
        } else {
          const error = await response.text()
          setUploadedContracts((prev: UploadedContract[]) =>
            prev.map((c: UploadedContract) =>
              c.id === contractId
                ? { ...c, status: 'error' as const, error: error }
                : c
            )
          )
        }
      } catch (error) {
        setUploadedContracts((prev: UploadedContract[]) =>
          prev.map((c: UploadedContract) =>
            c.id === contractId
              ? { ...c, status: 'error' as const, error: 'Network error' }
              : c
          )
        )
      }
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = e.dataTransfer.files
    handleFileUpload(files)
  }, [handleFileUpload])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      handleFileUpload(files)
    }
  }, [handleFileUpload])

  const handleIngestContracts = async () => {
    const successfulContracts = uploadedContracts.filter((c: UploadedContract) => c.status === 'success' && c.contractId)

    if (successfulContracts.length === 0) {
      alert('No successfully uploaded contracts to ingest.')
      return
    }

    setIsIngesting(true)

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(`${backendUrl}/contracts/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(successfulContracts.map((c: UploadedContract) => c.contractId))
      })

      if (response.ok) {
        alert('Contract ingestion started successfully!')
        setUploadedContracts([])
      } else {
        const error = await response.text()
        alert(`Failed to start ingestion: ${error}`)
      }
    } catch (error) {
      alert(`Network error: ${error}`)
    } finally {
      setIsIngesting(false)
    }
  }

  const allUploadsComplete = uploadedContracts.length > 0 && uploadedContracts.every((c: UploadedContract) => c.status !== 'uploading')
  const hasSuccessfulUploads = uploadedContracts.some((c: UploadedContract) => c.status === 'success')

  return (
    <div className="upload-container">
      <div className="upload-header">
        <h1>Upload Contracts</h1>
        <p>Upload PDF or DOCX contracts to begin the analysis process</p>
        <div className="header-actions">
          <Link href="/contracts" className="view-contracts-link">
            View All Contracts →
          </Link>
        </div>
      </div>

      <div
        className={`upload-zone ${isDragOver ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="upload-content">
          <div className="upload-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7,10 12,15 17,10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </div>
          <h3>Drop files here or click to browse</h3>
          <p>Supports PDF and DOCX files up to 10MB each</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx"
          onChange={handleFileInput}
          style={{ display: 'none' }}
        />
      </div>

      {uploadedContracts.length > 0 && (
        <div className="upload-list">
          <h3>Uploaded Contracts</h3>
          <div className="contract-list">
            {uploadedContracts.map((contract: UploadedContract) => (
              <div key={contract.id} className={`contract-item ${contract.status}`}>
                <div className="contract-info">
                  <span className="filename">{contract.filename}</span>
                  {contract.error && <span className="error-message">{contract.error}</span>}
                </div>
                <div className="status-icon">
                  {contract.status === 'uploading' && (
                    <div className="spinner"></div>
                  )}
                  {contract.status === 'success' && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20,6 9,17 4,12"/>
                    </svg>
                  )}
                  {contract.status === 'error' && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="15" y1="9" x2="9" y2="15"/>
                      <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {allUploadsComplete && hasSuccessfulUploads && (
        <div className="ingest-section">
          <button
            className="ingest-button"
            onClick={handleIngestContracts}
            disabled={isIngesting}
          >
            {isIngesting ? (
              <>
                <div className="spinner small"></div>
                Starting Ingestion...
              </>
            ) : (
              'Ingest Contracts'
            )}
          </button>
        </div>
      )}
    </div>
  )
}

export default UploadPage
