import React, { createContext, useContext, useCallback } from 'react'
import { useNotifications, ToastMessage } from '../../hooks/useNotifications'
import { ToastContainer } from './Toast'

export interface SimpleToast {
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  message: string
}

interface NotificationContextType {
  toasts: ToastMessage[]
  removeToast: (id: string) => void
  isConnected: boolean
  showToast: (toast: SimpleToast) => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { toasts, removeToast, isConnected, addToast } = useNotifications()

  const showToast = useCallback((simpleToast: SimpleToast) => {
    // Convert simple toast to full toast message format
    // Use a neutral jobType for general toasts
    addToast({
      type: simpleToast.type === 'success' || simpleToast.type === 'info' ? 'success' : 'error',
      title: simpleToast.title,
      message: simpleToast.message,
      jobType: 'ingestion' // Default jobType for styling
    })
  }, [addToast])

  return (
    <NotificationContext.Provider value={{ toasts, removeToast, isConnected, showToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </NotificationContext.Provider>
  )
}

export function useNotificationContext() {
  const context = useContext(NotificationContext)
  if (context === undefined) {
    throw new Error('useNotificationContext must be used within a NotificationProvider')
  }
  return context
}

