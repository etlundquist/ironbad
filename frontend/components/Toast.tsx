import React from 'react'

export interface ToastMessage {
  id: string
  type: 'success' | 'error'
  title: string
  message: string
  contractFilename?: string
  jobType: 'ingestion' | 'analysis'
  timestamp: Date
}

interface ToastProps {
  toast: ToastMessage
  onRemove: (id: string) => void
}

export function Toast({ toast, onRemove }: ToastProps) {
  const getIcon = () => {
    if (toast.type === 'success') {
      return (
        <svg style={{ width: '20px', height: '20px', color: '#10b981' }} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      )
    } else {
      return (
        <svg style={{ width: '20px', height: '20px', color: '#ef4444' }} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      )
    }
  }

  const getJobTypeColor = () => {
    if (toast.jobType === 'ingestion') {
      return { backgroundColor: '#dbeafe', borderColor: '#93c5fd' }
    } else {
      return { backgroundColor: '#f3e8ff', borderColor: '#c4b5fd' }
    }
  }

  const jobTypeStyle = getJobTypeColor()

  return (
    <div style={{
      maxWidth: '384px',
      width: '100%',
      backgroundColor: 'white',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      borderRadius: '8px',
      pointerEvents: 'auto',
      borderLeft: `4px solid ${toast.type === 'success' ? '#10b981' : '#ef4444'}`,
      ...jobTypeStyle
    }}>
      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div style={{ flexShrink: 0 }}>
            {getIcon()}
          </div>
          <div style={{ marginLeft: '12px', flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: '14px',
              fontWeight: '500',
              color: '#111827',
              margin: 0
            }}>
              {toast.title}
            </p>
            <p style={{
              marginTop: '4px',
              fontSize: '14px',
              color: '#6b7280',
              margin: '4px 0 0 0'
            }}>
              {toast.message}
            </p>
            {toast.contractFilename && (
              <p style={{
                marginTop: '4px',
                fontSize: '12px',
                color: '#9ca3af',
                margin: '4px 0 0 0'
              }}>
                Contract: {toast.contractFilename}
              </p>
            )}
          </div>
          <div style={{ marginLeft: '16px', flexShrink: 0, display: 'flex' }}>
            <button
              style={{
                backgroundColor: 'white',
                borderRadius: '6px',
                display: 'inline-flex',
                color: '#9ca3af',
                border: 'none',
                cursor: 'pointer',
                padding: '4px'
              }}
              onClick={() => onRemove(toast.id)}
              onMouseOver={(e) => e.currentTarget.style.color = '#6b7280'}
              onMouseOut={(e) => e.currentTarget.style.color = '#9ca3af'}
            >
              <span style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>Close</span>
              <svg style={{ height: '20px', width: '20px' }} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface ToastContainerProps {
  toasts: ToastMessage[]
  onRemove: (id: string) => void
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  console.log('ToastContainer rendering with toasts:', toasts)

  return (
    <div
      aria-live="assertive"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'flex-end',
        padding: '24px 16px',
        pointerEvents: 'none',
        zIndex: 50
      }}
    >
      <div style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px'
      }}>
        {toasts.map((toast) => {
          console.log('Rendering toast:', toast)
          return <Toast key={toast.id} toast={toast} onRemove={onRemove} />
        })}
      </div>
    </div>
  )
}
