import React, { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { Contract, ContractIssue } from '../../lib/types'
import { fetchContractIssues, resolveIssue, unresolveIssue, generateAIRevision, saveUserRevision } from '../../lib/api'
import { updateContractStatus, analyzeContracts } from '../../lib/api'
import { Spinner } from '../common/Spinner'
import { useNotificationContext } from '../common/NotificationProvider'

interface IssuesTabProps {
  contract: Contract
  isAnalyzing: boolean
  onAnalyze: () => void
  onContractUpdate: (contract: Contract) => void
  navigateToPage: (page: number) => void
}

export const IssuesTab: React.FC<IssuesTabProps> = ({ contract, isAnalyzing, onAnalyze, onContractUpdate, navigateToPage }) => {
  const { showToast } = useNotificationContext()
  const [contractIssues, setContractIssues] = useState<ContractIssue[]>([])
  const [issuesLoading, setIssuesLoading] = useState(false)
  const [issuesFetched, setIssuesFetched] = useState(false)
  const [expandedIssueClause, setExpandedIssueClause] = useState<string | null>(null)
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null)
  const [revisionDrafts, setRevisionDrafts] = useState<Record<string, string>>({})
  const [savingIssueId, setSavingIssueId] = useState<string | null>(null)
  const [generatingIssueId, setGeneratingIssueId] = useState<string | null>(null)

  useEffect(() => {
    if (!issuesLoading && !issuesFetched) {
      fetchIssuesData()
    }
  }, [])

  const fetchIssuesData = async () => {
    try {
      setIssuesLoading(true)
      const issuesData = await fetchContractIssues(contract.id)
      setContractIssues(issuesData)
      setIssuesFetched(true)
    } catch (err) {
      console.error('Error fetching issues data:', err)
      setIssuesFetched(true)
    } finally {
      setIssuesLoading(false)
    }
  }

  const getIssuesByStandardClause = () => {
    const grouped: { [key: string]: ContractIssue[] } = {}
    contractIssues.forEach(issue => {
      if (issue.standard_clause) {
        const clauseId = issue.standard_clause.id
        if (!grouped[clauseId]) {
          grouped[clauseId] = []
        }
        grouped[clauseId].push(issue)
      }
    })
    return grouped
  }

  const getClauseSeverityClass = (issues: ContractIssue[]): string => {
    const openIssues = issues.filter(i => i.status && i.status.toLowerCase() === 'open')
    const hasCritical = openIssues.some(i => i.standard_clause_rule?.severity && i.standard_clause_rule.severity.toLowerCase() === 'critical')
    const hasWarning = openIssues.some(i => i.standard_clause_rule?.severity && i.standard_clause_rule.severity.toLowerCase() === 'warning')
    const hasInfo = openIssues.some(i => i.standard_clause_rule?.severity && i.standard_clause_rule.severity.toLowerCase() === 'info')

    if (hasCritical) return 'severity-critical'
    if (hasWarning) return 'severity-warning'
    if (hasInfo) return 'severity-info'
    return 'severity-resolved'
  }

  const toggleIssueClauseExpansion = (clauseId: string) => {
    setExpandedIssueClause(expandedIssueClause === clauseId ? null : clauseId)
  }

  const getSeverityLevel = (severity: string): 'info' | 'warning' | 'critical' => {
    const s = (severity || '').toLowerCase()
    if (s === 'critical') return 'critical'
    if (s === 'high' || s === 'medium' || s === 'warning') return 'warning'
    return 'info'
  }

  const handleResolveIssue = async (issueId: string, resolution: 'ignore' | 'suggest_revision') => {
    try {
      const updated = await resolveIssue(contract.id, issueId, resolution)
      setContractIssues(prev => prev.map(i => i.id === updated.id ? updated : i))
      if (resolution === 'ignore') {
        setRevisionDrafts(prev => ({ ...prev, [issueId]: '' }))
      }
      setExpandedIssueId(prev => (prev === issueId ? null : prev))
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Failed to Resolve Issue',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  const handleUnresolveIssue = async (issueId: string) => {
    try {
      const updated = await unresolveIssue(contract.id, issueId)
      setContractIssues(prev => prev.map(i => i.id === updated.id ? updated : i))
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Failed to Unresolve Issue',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  const handleGenerateRevision = async (issueId: string) => {
    try {
      setGeneratingIssueId(issueId)
      const updated = await generateAIRevision(contract.id, issueId)
      setContractIssues(prev => prev.map(i => i.id === updated.id ? updated : i))
      setRevisionDrafts(prev => ({ ...prev, [issueId]: updated.active_suggested_revision || '' }))
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Failed to Generate Revision',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setGeneratingIssueId(null)
    }
  }

  const handleSaveRevision = async (issueId: string) => {
    try {
      setSavingIssueId(issueId)
      const updated = await saveUserRevision(contract.id, issueId, revisionDrafts[issueId] ?? '')
      setContractIssues(prev => prev.map(i => i.id === updated.id ? updated : i))
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Failed to Save Revision',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setSavingIssueId(null)
    }
  }

  const handleCompleteReview = async () => {
    try {
      const updated = await updateContractStatus(contract.id, 'Review Completed')
      onContractUpdate(updated)
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Failed to Complete Review',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  const handleReopenReview = async () => {
    try {
      const updated = await updateContractStatus(contract.id, 'Under Review')
      onContractUpdate(updated)
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Failed to Reopen Review',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  const getAnalyzeCTA = () => {
    switch (contract.status) {
      case 'Ready for Review':
        return (
          <button className="cta-button primary" onClick={onAnalyze} disabled={isAnalyzing}>
            {isAnalyzing ? (
              <>
                <Spinner size="small" />
                Analyzing...
              </>
            ) : (
              'Analyze Contract'
            )}
          </button>
        )
      case 'Uploaded':
      case 'Ingesting':
        return (
          <div className="cta-banner info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4"/>
              <path d="M12 8h.01"/>
            </svg>
            Contracts must be ingested prior to review
          </div>
        )
      default:
        return null
    }
  }

  const openCount = contractIssues.filter(i => i.status && i.status.toLowerCase() === 'open').length

  return (
    <div className="tab-panel">
      <div className="tab-header">
        <div className="tab-header-content">
          <h3>Identified Issues</h3>
          {!issuesLoading && contractIssues.length > 0 && (() => {
            const open = contractIssues.filter(i => i.status && i.status.toLowerCase() === 'open').length
            const resolved = contractIssues.filter(i => i.status && i.status.toLowerCase() === 'resolved')
            const dismissed = resolved.filter(i => i.resolution === 'ignore').length
            const suggested = resolved.filter(i => i.resolution === 'suggest_revision').length
            return (
              <div className="issues-count">
                <div>{open} Open Issues</div>
                <div>{dismissed} Dismissed Issues</div>
                <div>{suggested} Suggested Revisions</div>
              </div>
            )
          })()}
        </div>
        <div className="tab-header-actions">
          {contract.status === 'Under Review' && openCount === 0 && (
            <button className="cta-button primary" onClick={handleCompleteReview}>
              Complete Review
            </button>
          )}
          {contract.status === 'Review Completed' && (
            <button className="cta-button secondary" onClick={handleReopenReview}>
              Re-Open Review
            </button>
          )}
        </div>
      </div>

      {issuesLoading ? (
        <div className="issues-loading">
          <Spinner size="large" />
          <p>Loading issues...</p>
        </div>
      ) : (
        <div className="issues-list">
          {Object.entries(getIssuesByStandardClause()).map(([clauseId, issues]) => {
            const standardClause = issues[0]?.standard_clause
            if (!standardClause) return null

            const isExpanded = expandedIssueClause === clauseId
            const severityClass = getClauseSeverityClass(issues)

            return (
              <div key={clauseId} className={`issue-clause-item ${severityClass}`}>
                <div className="issue-clause-header" onClick={() => toggleIssueClauseExpansion(clauseId)}>
                  <div className="issue-clause-info">
                    <div className="issue-clause-name">
                      {standardClause.display_name}
                    </div>
                    <div className="issue-count">
                      {issues.filter(issue => issue.status && issue.status.toLowerCase() === 'open').length} Open Issues
                      <br />
                      {(() => {
                        const resolved = issues.filter(issue => issue.status && issue.status.toLowerCase() === 'resolved')
                        const dismissed = resolved.filter(i => i.resolution === 'ignore').length
                        const suggested = resolved.filter(i => i.resolution === 'suggest_revision').length
                        return (
                          <>
                            <span>{dismissed} Dismissed Issues</span>
                            <br />
                            <span>{suggested} Suggested Revisions</span>
                          </>
                        )
                      })()}
                    </div>
                  </div>
                  <div className="issue-clause-expand">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
                      <path d="M6 8L2 4h8l-4 4z"/>
                    </svg>
                  </div>
                </div>

                {isExpanded && (
                  <div className="issue-clause-content">
                    {issues.map((issue) => {
                      const isResolved = issue.status && issue.status.toLowerCase() === 'resolved'
                      const sev = getSeverityLevel(issue.standard_clause_rule?.severity || '')
                      return (
                        <div key={issue.id} className={`issue-item ${isResolved ? 'resolved' : ''} severity-${sev}`}>
                          <div className="issue-header">
                            <div className="issue-status">
                              {isResolved ? (
                                issue.resolution === 'ignore' ? (
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M8 8l8 8M16 8l-8 8" strokeLinecap="round" />
                                  </svg>
                                ) : issue.resolution === 'suggest_revision' ? (
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2">
                                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" />
                                    <path d="M14.06 6.19l3.75 3.75" />
                                  </svg>
                                ) : (
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )
                              ) : (
                                <span className={`status-dot ${sev}`}></span>
                              )}
                            </div>
                            <div className="issue-title">
                              {issue.standard_clause_rule?.title || 'Unknown Issue'}
                            </div>
                            <div className="issue-sections">
                              {issue.citations && issue.citations.length > 0 ? (
                                <div className="section-numbers">
                                  {issue.citations.map((citation, index) => (
                                    <button
                                      key={index}
                                      type="button"
                                      className="section-number link"
                                      onClick={() => navigateToPage((citation.beg_page || 1))}
                                      title={citation.section_name || `Section ${citation.section_number}`}
                                    >
                                      {citation.section_number}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <span className="no-sections">No sections</span>
                              )}
                            </div>
                            <div className="issue-expand" onClick={() => setExpandedIssueId(expandedIssueId === issue.id ? null : issue.id)}>
                              <span className="review-label">Resolve</span>
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className={`expand-icon ${expandedIssueId === issue.id ? 'expanded' : ''}`}>
                                <path d="M6 8L2 4h8l-4 4z"/>
                              </svg>
                            </div>
                          </div>
                          {expandedIssueId === issue.id && (
                            <div className="issue-actions">
                              <div className="issue-section">
                                <div className="issue-section-title">Policy Rule</div>
                                <div className="issue-section-body clause-markdown"><ReactMarkdown>{issue.standard_clause_rule?.text || ''}</ReactMarkdown></div>
                              </div>
                              <div className="issue-section">
                                <div className="issue-section-title">Issue Explanation</div>
                                <div className="issue-section-body clause-markdown"><ReactMarkdown>{issue.explanation || ''}</ReactMarkdown></div>
                              </div>
                              <div className="issue-section">
                                <div className="issue-section-title">Relevant Contract Text</div>
                                <div className="issue-section-body contract-text-block">{issue.relevant_text || ''}</div>
                              </div>
                              <div className="issue-section">
                                <div className="issue-section-header">
                                  <div className="issue-section-title">Suggested Revision</div>
                                  <div className="issue-actions-inline">
                                    {!isResolved && (
                                      <button
                                        className="cta-button secondary"
                                        onClick={() => handleGenerateRevision(issue.id)}
                                        disabled={generatingIssueId === issue.id || savingIssueId === issue.id}
                                        title="Generate Suggested Revision with AI"
                                      >
                                        <span className="icon ai-sparkle" aria-hidden="true"></span>
                                        {generatingIssueId === issue.id ? 'Generating…' : 'Generate Suggested Revision'}
                                      </button>
                                    )}
                                    {!isResolved && (revisionDrafts[issue.id] ?? (issue.active_suggested_revision || '')) !== (issue.active_suggested_revision || '') && (
                                      <button
                                        className="cta-button primary"
                                        onClick={() => handleSaveRevision(issue.id)}
                                        disabled={savingIssueId === issue.id || generatingIssueId === issue.id}
                                        title="Save Suggested Revision"
                                      >
                                        <span className="icon floppy" aria-hidden="true"></span>
                                        {savingIssueId === issue.id ? 'Saving…' : 'Save Suggested Revision'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <textarea
                                  className={`revision-textarea${isResolved ? ' readonly' : ''}`}
                                  placeholder="Enter a proposed revision..."
                                  value={revisionDrafts[issue.id] ?? (issue.active_suggested_revision || '')}
                                  onChange={(e) => setRevisionDrafts(prev => ({ ...prev, [issue.id]: e.target.value }))}
                                  readOnly={isResolved}
                                />
                                <div className="issue-cta-row">
                                  {isResolved ? (
                                    contract.status === 'Review Completed' ? null : (
                                      <button className="cta-button primary block" onClick={() => handleUnresolveIssue(issue.id)}>
                                        Re-Open Issue
                                      </button>
                                    )
                                  ) : (
                                    <>
                                      <button className="cta-button secondary half" onClick={() => handleResolveIssue(issue.id, 'ignore')}>
                                        Dismiss Issue
                                      </button>
                                      {(() => {
                                        const currentRevision = (revisionDrafts[issue.id] ?? (issue.active_suggested_revision || '')).trim()
                                        if (!currentRevision) return null
                                        return (
                                          <button className="cta-button primary half" onClick={() => handleResolveIssue(issue.id, 'suggest_revision')}>
                                            Submit Suggested Revision
                                          </button>
                                        )
                                      })()}
                                    </>
                                  )}
                                </div>
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
          })}

          {Object.keys(getIssuesByStandardClause()).length === 0 && (
            <div className="no-issues">
              {contract.status === 'Ready for Review' ? (
                <>
                  <h4>Ready for Analysis</h4>
                  <p>Analyze the contract to detect potential issues</p>
                  <div className="no-issues-actions">
                    {getAnalyzeCTA()}
                  </div>
                </>
              ) : contract.status === 'Analyzing' ? (
                <>
                  <div className="no-issues-icon">
                    <Spinner size="large" />
                  </div>
                  <h4>Analyzing Contract</h4>
                  <p>Please wait while we analyze the contract for potential issues...</p>
                </>
              ) : (
                <>
                  <div className="no-issues-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 12l2 2 4-4"/>
                      <circle cx="12" cy="12" r="10"/>
                    </svg>
                  </div>
                  <h4>No Issues Found</h4>
                  <p>This contract appears to be compliant with all standard clause rules.</p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

