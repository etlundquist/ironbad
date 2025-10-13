import React from 'react'
import { UploadedContract } from '../../lib/types'

interface UploadListProps {
  uploadedContracts: UploadedContract[]
}

export const UploadList: React.FC<UploadListProps> = ({ uploadedContracts }) => {
  if (uploadedContracts.length === 0) return null

  return (
    <div className="upload-list">
      <h3>Uploaded Contracts</h3>
      <div className="contract-list">
        {uploadedContracts.map((contract) => (
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
  )
}

