import React, { useState, useEffect } from 'react'
import { Contract, ContractMetadata } from '../../lib/types'
import { updateContractMetadata, ingestContracts } from '../../lib/api'
import { Spinner } from '../common/Spinner'
import { useNotificationContext } from '../common/NotificationProvider'

interface MetadataFormProps {
  contract: Contract
  onContractUpdate: (contract: Contract) => void
  isAnalyzing: boolean
  onIngest: () => void
}

export const MetadataForm: React.FC<MetadataFormProps> = ({ contract, onContractUpdate, isAnalyzing, onIngest }) => {
  const { showToast } = useNotificationContext()
  const [metadata, setMetadata] = useState<ContractMetadata>({
    document_type: "Master Agreement",
    document_title: "",
    customer_name: "",
    supplier_name: "",
    effective_date: "",
    initial_term: ""
  })
  const [originalMetadata, setOriginalMetadata] = useState<ContractMetadata | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    if (contract.meta) {
      setMetadata(contract.meta)
      setOriginalMetadata(contract.meta)
    } else {
      const defaultMetadata: ContractMetadata = {
        document_type: "Master Agreement",
        document_title: "",
        customer_name: "",
        supplier_name: "",
        effective_date: "",
        initial_term: ""
      }
      setMetadata(defaultMetadata)
      setOriginalMetadata(defaultMetadata)
    }
  }, [contract])

  const handleMetadataChange = (field: keyof ContractMetadata, value: string) => {
    const newMetadata = { ...metadata, [field]: value }
    setMetadata(newMetadata)

    const hasChanges = originalMetadata ?
      JSON.stringify(newMetadata) !== JSON.stringify(originalMetadata) :
      Object.values(newMetadata).some(val => val !== "")
    setHasChanges(hasChanges)
  }

  const handleSaveMetadata = async () => {
    setIsSaving(true)
    try {
      const updatedContract = await updateContractMetadata(contract.id, metadata)
      onContractUpdate(updatedContract)
      setOriginalMetadata(metadata)
      setHasChanges(false)
      showToast({
        type: 'success',
        title: 'Metadata Saved',
        message: 'Metadata saved successfully!'
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Save Failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setIsSaving(false)
    }
  }

  const getIngestCTA = () => {
    switch (contract.status) {
      case 'Uploaded':
        return (
          <button className="cta-button primary" onClick={onIngest} disabled={isAnalyzing}>
            {isAnalyzing ? (
              <>
                <Spinner size="small" />
                Ingesting...
              </>
            ) : (
              'Ingest Contract'
            )}
          </button>
        )
      case 'Ingesting':
        return (
          <div className="cta-banner processing">
            <Spinner size="small" />
            Contract is currently being ingested
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="tab-panel">
      <div className="tab-header">
        <h3>Contract Metadata</h3>
        <div className="tab-header-actions">
          {hasChanges && (
            <button
              onClick={handleSaveMetadata}
              disabled={isSaving}
              className="save-button"
            >
              {isSaving ? (
                <>
                  <Spinner size="small" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          )}
          {getIngestCTA()}
        </div>
      </div>

      <div className="metadata-form">
        <div className="form-group">
          <label htmlFor="document_type">Document Type</label>
          <select
            id="document_type"
            value={metadata.document_type}
            onChange={(e) => handleMetadataChange('document_type', e.target.value)}
            className="form-select"
          >
            <option value="Master Agreement">Master Agreement</option>
            <option value="Statement of Work">Statement of Work</option>
            <option value="Purchase Order">Purchase Order</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="document_title">Document Title</label>
          <input
            type="text"
            id="document_title"
            value={metadata.document_title || ''}
            onChange={(e) => handleMetadataChange('document_title', e.target.value)}
            className="form-input"
            placeholder="Enter document title"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="customer_name">Customer Name</label>
            <input
              type="text"
              id="customer_name"
              value={metadata.customer_name || ''}
              onChange={(e) => handleMetadataChange('customer_name', e.target.value)}
              className="form-input"
              placeholder="Enter customer name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="supplier_name">Supplier Name</label>
            <input
              type="text"
              id="supplier_name"
              value={metadata.supplier_name || ''}
              onChange={(e) => handleMetadataChange('supplier_name', e.target.value)}
              className="form-input"
              placeholder="Enter supplier name"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="effective_date">Effective Date</label>
            <input
              type="date"
              id="effective_date"
              value={metadata.effective_date || ''}
              onChange={(e) => handleMetadataChange('effective_date', e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="initial_term">Initial Term</label>
            <input
              type="text"
              id="initial_term"
              value={metadata.initial_term || ''}
              onChange={(e) => handleMetadataChange('initial_term', e.target.value)}
              className="form-input"
              placeholder="e.g., 12 months, 2 years"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

