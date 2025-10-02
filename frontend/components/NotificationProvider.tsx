import React, { createContext, useContext } from 'react'
import { useNotifications, ToastMessage } from '../hooks/useNotifications'
import { ToastContainer } from './Toast'

interface NotificationContextType {
  toasts: ToastMessage[]
  removeToast: (id: string) => void
  isConnected: boolean
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { toasts, removeToast, isConnected } = useNotifications()

  console.log('NotificationProvider rendering with toasts:', toasts)

  return (
    <NotificationContext.Provider value={{ toasts, removeToast, isConnected }}>
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
