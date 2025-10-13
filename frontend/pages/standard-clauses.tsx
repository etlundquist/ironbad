import { NextPage } from 'next'
import React, { useState, useEffect } from 'react'
import { StandardClause } from '../lib/types/standard-clause'
import { fetchStandardClausesWithRules, deleteStandardClause } from '../lib/api/standard-clauses'
import { StandardClauseForm } from '../components/standard-clauses/StandardClauseForm'
import { StandardClauseList } from '../components/standard-clauses/StandardClauseList'
import { Spinner } from '../components/common/Spinner'

const StandardClausesPage: NextPage = () => {
  const [clauses, setClauses] = useState<StandardClause[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingClause, setEditingClause] = useState<StandardClause | null>(null)

  useEffect(() => {
    fetchClauses()
  }, [])

  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showAddForm) {
        handleCancel()
      }
    }

    if (showAddForm) {
      document.addEventListener('keydown', handleEscKey)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey)
      document.body.style.overflow = 'unset'
    }
  }, [showAddForm])

  const fetchClauses = async () => {
    try {
      setLoading(true)
      const data = await fetchStandardClausesWithRules()
      setClauses(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleAddNew = () => {
    setEditingClause(null)
    setShowAddForm(true)
  }

  const handleEdit = (clause: StandardClause) => {
    setEditingClause(clause)
    setShowAddForm(true)
  }

  const handleCancel = () => {
    setShowAddForm(false)
    setEditingClause(null)
  }

  const handleSuccess = async () => {
    await fetchClauses()
  }

  const handleDelete = async (clauseId: string, clauseName: string) => {
    if (!confirm(`Are you sure you want to delete the standard clause "${clauseName}"? This action cannot be undone.`)) {
      return
    }

    try {
      await deleteStandardClause(clauseId)
      await fetchClauses()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  if (loading) {
    return (
      <div className="page-container">
        <main className="main-content">
          <div className="loading-state">
            <Spinner size="large" />
            <p>Loading standard clauses...</p>
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
            <button onClick={fetchClauses} className="retry-button">
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
        {showAddForm && (
          <StandardClauseForm
            editingClause={editingClause}
            onClose={handleCancel}
            onSuccess={handleSuccess}
          />
        )}

        <StandardClauseList
          clauses={clauses}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
          <button onClick={handleAddNew} className="primary-button">
            + Add New Clause
          </button>
        </div>
      </main>
    </div>
  )
}

export default StandardClausesPage
