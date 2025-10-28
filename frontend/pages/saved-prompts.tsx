import { NextPage } from 'next'
import React, { useState, useEffect } from 'react'
import { SavedPrompt } from '../lib/types/saved-prompt'
import { fetchSavedPrompts, deleteSavedPrompt } from '../lib/api/saved-prompts'
import { SavedPromptForm } from '../components/saved-prompts/PromptForm'
import { SavedPromptList } from '../components/saved-prompts/PromptList'
import { Spinner } from '../components/common/Spinner'

const SavedPromptsPage: NextPage = () => {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<SavedPrompt | null>(null)

  useEffect(() => {
    fetchPrompts()
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

  const fetchPrompts = async () => {
    try {
      setLoading(true)
      const data = await fetchSavedPrompts()
      setPrompts(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleAddNew = () => {
    setEditingPrompt(null)
    setShowAddForm(true)
  }

  const handleEdit = (prompt: SavedPrompt) => {
    setEditingPrompt(prompt)
    setShowAddForm(true)
  }

  const handleCancel = () => {
    setShowAddForm(false)
    setEditingPrompt(null)
  }

  const handleSuccess = async () => {
    await fetchPrompts()
  }

  const handleDelete = async (promptId: string, promptName: string) => {
    if (!confirm(`Are you sure you want to delete the saved prompt "${promptName}"? This action cannot be undone.`)) {
      return
    }

    try {
      await deleteSavedPrompt(promptId)
      await fetchPrompts()
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
            <p>Loading saved prompts...</p>
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
            <button onClick={fetchPrompts} className="retry-button">
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
          <SavedPromptForm
            editingPrompt={editingPrompt}
            onClose={handleCancel}
            onSuccess={handleSuccess}
          />
        )}

        <SavedPromptList
          prompts={prompts}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
          <button onClick={handleAddNew} className="primary-button">
            + Add New Prompt
          </button>
        </div>
      </main>
    </div>
  )
}

export default SavedPromptsPage

