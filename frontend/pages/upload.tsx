import { NextPage } from 'next'
import React, { useState, useCallback } from 'react'
import { UploadedContract } from '../lib/types'
import { uploadContract, ingestContracts } from '../lib/api'
import { DropZone } from '../components/upload/DropZone'
import { UploadList } from '../components/upload/UploadList'
import { Spinner } from '../components/common/Spinner'
import { useNotificationContext } from '../components/common/NotificationProvider'

const UploadPage: NextPage = () => {
  const [uploadedContracts, setUploadedContracts] = useState<UploadedContract[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isIngesting, setIsIngesting] = useState(false)
  const { showToast } = useNotificationContext()

  const handleFileUpload = useCallback(async (files: FileList) => {
    const fileArray = Array.from(files).filter(file =>
      file.type === 'application/pdf' ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )

    if (fileArray.length === 0) {
      showToast({
        type: 'warning',
        title: 'Invalid File Type',
        message: 'Please select PDF or DOCX files only.'
      })
      return
    }

    const newContracts: UploadedContract[] = fileArray.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      filename: file.name,
      status: 'uploading'
    }))

    setUploadedContracts((prev) => [...prev, ...newContracts])

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i]
      const contractId = newContracts[i].id

      try {
        const contract = await uploadContract(file)
        setUploadedContracts((prev) =>
          prev.map((c) =>
            c.id === contractId ? { ...c, status: 'success' as const, contractId: contract.id } : c
          )
        )
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Network error'
        setUploadedContracts((prev) =>
          prev.map((c) =>
            c.id === contractId ? { ...c, status: 'error' as const, error: errorMessage } : c
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
    const successfulContracts = uploadedContracts.filter((c) => c.status === 'success' && c.contractId)

    if (successfulContracts.length === 0) {
      showToast({
        type: 'warning',
        title: 'No Contracts to Ingest',
        message: 'No successfully uploaded contracts to ingest.'
      })
      return
    }

    setIsIngesting(true)

    try {
      await ingestContracts(successfulContracts.map((c) => c.contractId!))
      showToast({
        type: 'success',
        title: 'Ingestion Started',
        message: 'Contract ingestion started successfully!'
      })
      setUploadedContracts([])
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Ingestion Failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setIsIngesting(false)
    }
  }

  const allUploadsComplete = uploadedContracts.length > 0 && uploadedContracts.every((c) => c.status !== 'uploading')
  const hasSuccessfulUploads = uploadedContracts.some((c) => c.status === 'success')

  return (
    <div className="page-container">
      <main className="main-content">
        <div className="upload-header">
          <h1>Upload Contracts</h1>
          <p>Upload PDF or DOCX contracts to begin the analysis process</p>
        </div>

        <DropZone
          isDragOver={isDragOver}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onFileInput={handleFileInput}
        />

        <UploadList uploadedContracts={uploadedContracts} />

        {allUploadsComplete && hasSuccessfulUploads && (
          <div className="ingest-section">
            <button
              className="ingest-button"
              onClick={handleIngestContracts}
              disabled={isIngesting}
            >
              {isIngesting ? (
                <>
                  <Spinner size="small" />
                  Starting Ingestion...
                </>
              ) : (
                'Ingest Contracts'
              )}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

export default UploadPage
