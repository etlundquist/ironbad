import React, { useState } from 'react'
import { AnnotationModalState } from './types'

interface AnnotationModalProps {
  modal: AnnotationModalState
  onClose: () => void
  onSubmit: (type: 'comment' | 'revision', content: string) => void
  onAttachToChat?: (nodeId: string, offsetBeg: number, offsetEnd: number, selectedText: string) => void
  decodeHtmlEntities: (text: string) => string
}

const AnnotationModal: React.FC<AnnotationModalProps> = ({
  modal,
  onClose,
  onSubmit,
  onAttachToChat,
  decodeHtmlEntities
}) => {
  const [annotationType, setAnnotationType] = useState<'comment' | 'revision' | null>(modal.type)
  const [content, setContent] = useState('')

  if (!modal.isOpen) return null

  const handleSubmit = () => {
    if (annotationType && content.trim()) {
      onSubmit(annotationType, content.trim())
      setContent('')
      setAnnotationType(null)
    }
  }

  return (
    <div
      className="annotation-modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
      }}
    >
      <div
        className="annotation-modal"
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '500px',
          width: '90%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
        }}
      >
        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
          Annotate Selected Text
        </h3>

        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: '#f3f4f6',
              borderRadius: '4px',
              fontSize: '14px',
              fontStyle: 'italic',
              border: '1px solid #e5e7eb'
            }}
          >
            {decodeHtmlEntities(modal.selectedText)}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <button
            onClick={() => setAnnotationType('comment')}
            style={{
              flex: 1,
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              backgroundColor: annotationType === 'comment' ? '#3b82f6' : '#ffffff',
              color: annotationType === 'comment' ? '#ffffff' : '#374151',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Add Comment
          </button>
          <button
            onClick={() => setAnnotationType('revision')}
            style={{
              flex: 1,
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              backgroundColor: annotationType === 'revision' ? '#3b82f6' : '#ffffff',
              color: annotationType === 'revision' ? '#ffffff' : '#374151',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Suggest Revision
          </button>
          {onAttachToChat && (
            <button
              onClick={() => {
                onAttachToChat(modal.nodeId, modal.offsetBeg, modal.offsetEnd, modal.selectedText)
                onClose()
              }}
              style={{
                flex: 1,
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                backgroundColor: '#ffffff',
                color: '#374151',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Attach to Chat
            </button>
          )}
        </div>

        {annotationType && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
              {annotationType === 'comment' ? 'Comment:' : 'Replacement text:'}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                annotationType === 'comment'
                  ? 'Add your comment about the selected text...'
                  : 'Enter the replacement text...'
              }
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                resize: 'vertical',
                fontFamily: 'inherit'
              }}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              backgroundColor: '#ffffff',
              color: '#374151',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          {annotationType && (
            <button
              onClick={handleSubmit}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              {annotationType === 'comment' ? 'Add Comment' : 'Suggest Revision'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default AnnotationModal

