import React from 'react'

export function getFileIcon(filetype: string): JSX.Element {
  if (filetype === 'application/pdf') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="file-icon pdf">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10,9 9,9 8,9"/>
      </svg>
    )
  } else if (filetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="file-icon docx">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10,9 9,9 8,9"/>
      </svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="file-icon unknown">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
    </svg>
  )
}

export function getStatusBadge(status: string): JSX.Element {
  const statusClasses: Record<string, string> = {
    'Pending': 'status-pending',
    'Ingesting': 'status-ingesting',
    'Ingested': 'status-ingested',
    'Analyzing': 'status-analyzing',
    'Ready for Review': 'status-ready',
    'Under Review': 'status-review',
    'Review Completed': 'status-completed'
  }

  return (
    <span className={`status-badge ${statusClasses[status] || 'status-default'}`}>
      {status}
    </span>
  )
}
