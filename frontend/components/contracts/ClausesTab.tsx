import React, { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { StandardClause, ContractClause, Contract } from '../../lib/types'
import { fetchStandardClauses, fetchContractClauses } from '../../lib/api'
import { Spinner } from '../common/Spinner'

interface ClausesTabProps {
  contract: Contract
  isAnalyzing: boolean
  onIngest: () => void
}

export const ClausesTab: React.FC<ClausesTabProps> = ({ contract, isAnalyzing, onIngest }) => {
  const [standardClauses, setStandardClauses] = useState<StandardClause[]>([])
  const [contractClauses, setContractClauses] = useState<ContractClause[]>([])
  const [clausesLoading, setClausesLoading] = useState(false)
  const [expandedClause, setExpandedClause] = useState<string | null>(null)

  useEffect(() => {
    if (!clausesLoading && standardClauses.length === 0) {
      fetchClausesData()
    }
  }, [])

  const fetchClausesData = async () => {
    try {
      setClausesLoading(true)
      const [standardClausesData, contractClausesData] = await Promise.all([
        fetchStandardClauses(),
        fetchContractClauses(contract.id)
      ])

      setStandardClauses(standardClausesData)
      setContractClauses(contractClausesData)
    } catch (err) {
      console.error('Error fetching clauses data:', err)
    } finally {
      setClausesLoading(false)
    }
  }

  const getContractClauseForStandardClause = (standardClauseId: string): ContractClause | undefined => {
    return contractClauses.find(cc => cc.standard_clause_id === standardClauseId)
  }

  const toggleClauseExpansion = (clauseId: string) => {
    setExpandedClause(expandedClause === clauseId ? null : clauseId)
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
        <div className="tab-header-content">
          <h3>Extracted Clauses</h3>
          {!clausesLoading && standardClauses.length > 0 && (
            <div className="clauses-count">
              <div>{contractClauses.length} standard clauses extracted</div>
              <div>{standardClauses.length - contractClauses.length} standard clauses not found</div>
            </div>
          )}
        </div>
        <div className="tab-header-actions">
          {getIngestCTA()}
        </div>
      </div>

      {clausesLoading ? (
        <div className="clauses-loading">
          <Spinner size="large" />
          <p>Loading clauses...</p>
        </div>
      ) : (
        <div className="clauses-list">
          {standardClauses.map((standardClause) => {
            const contractClause = getContractClauseForStandardClause(standardClause.id)
            const isFound = !!contractClause
            const isExpanded = expandedClause === standardClause.id

            return (
              <div key={standardClause.id} className={`clause-item ${isFound ? 'found' : 'missing'}`}>
                <div className="clause-header" onClick={() => isFound && toggleClauseExpansion(standardClause.id)}>
                  <div className="clause-status">
                    {isFound ? (
                      <div className="status-icon found">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                        </svg>
                      </div>
                    ) : (
                      <div className="status-icon missing">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="clause-name">
                    {standardClause.display_name}
                  </div>
                  {isFound && (
                    <div className="clause-expand">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="currentColor"
                        className={`expand-icon ${isExpanded ? 'expanded' : ''}`}
                      >
                        <path d="M6 8L2 4h8l-4 4z"/>
                      </svg>
                    </div>
                  )}
                </div>

                {isFound && isExpanded && contractClause && (
                  <div className="clause-content">
                    <div className="clause-markdown">
                      <ReactMarkdown>{contractClause.cleaned_markdown}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

