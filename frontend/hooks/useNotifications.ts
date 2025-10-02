import { useEffect, useRef, useState } from 'react'

export interface JobStatusUpdate {
  contract_id: string
  status: 'queued' | 'in_progress' | 'completed' | 'failed'
  errors?: Array<{ step: string; message: string }>
  timestamp: string
}

export interface NotificationEvent {
  event: 'ingestion' | 'analysis'
  data: JobStatusUpdate
}

export interface ToastMessage {
  id: string
  type: 'success' | 'error'
  title: string
  message: string
  contractFilename?: string
  jobType: 'ingestion' | 'analysis'
  timestamp: Date
}

export interface UseNotificationsReturn {
  toasts: ToastMessage[]
  removeToast: (id: string) => void
  isConnected: boolean
}

export function useNotifications(): UseNotificationsReturn {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  const addToast = (toast: Omit<ToastMessage, 'id' | 'timestamp'>) => {
    const id = Math.random().toString(36).substr(2, 9)
    const newToast: ToastMessage = {
      ...toast,
      id,
      timestamp: new Date()
    }
    console.log('Adding toast:', newToast)
    setToasts(prev => {
      const updated = [...prev, newToast]
      console.log('Updated toasts array:', updated)
      return updated
    })

    // Auto-remove toast after 5 seconds
    setTimeout(() => {
      console.log('Auto-removing toast:', id)
      removeToast(id)
    }, 5000)
  }

  const connect = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
    const eventSource = new EventSource(`${backendUrl}/notifications`)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      console.log('SSE connection opened to /notifications')
      setIsConnected(true)
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }

    // Handle ingestion events
    eventSource.addEventListener('ingestion', (event) => {
      try {
        const jobStatusUpdate: JobStatusUpdate = JSON.parse(event.data)
        console.log('Received ingestion notification:', jobStatusUpdate)

        // Create toast message
        const isSuccess = jobStatusUpdate.status === 'completed'

        addToast({
          type: isSuccess ? 'success' : 'error',
          title: `Ingestion ${isSuccess ? 'Completed' : 'Failed'}`,
          message: isSuccess
            ? `Contract ingestion completed successfully`
            : `Contract ingestion failed: ${jobStatusUpdate.errors?.[0]?.message || 'Unknown error'}`,
          contractFilename: jobStatusUpdate.contract_id, // We'll need to get the actual filename
          jobType: 'ingestion'
        })

        // Trigger a custom event for contract refresh
        window.dispatchEvent(new CustomEvent('contractStatusUpdate', {
          detail: {
            contractId: jobStatusUpdate.contract_id,
            status: jobStatusUpdate.status,
            jobType: 'ingestion'
          }
        }))
      } catch (error) {
        console.error('Error parsing ingestion notification:', error)
      }
    })

    // Handle analysis events
    eventSource.addEventListener('analysis', (event) => {
      try {
        const jobStatusUpdate: JobStatusUpdate = JSON.parse(event.data)
        console.log('Received analysis notification:', jobStatusUpdate)

        // Create toast message
        const isSuccess = jobStatusUpdate.status === 'completed'

        addToast({
          type: isSuccess ? 'success' : 'error',
          title: `Analysis ${isSuccess ? 'Completed' : 'Failed'}`,
          message: isSuccess
            ? `Contract analysis completed successfully`
            : `Contract analysis failed: ${jobStatusUpdate.errors?.[0]?.message || 'Unknown error'}`,
          contractFilename: jobStatusUpdate.contract_id, // We'll need to get the actual filename
          jobType: 'analysis'
        })

        // Trigger a custom event for contract refresh
        window.dispatchEvent(new CustomEvent('contractStatusUpdate', {
          detail: {
            contractId: jobStatusUpdate.contract_id,
            status: jobStatusUpdate.status,
            jobType: 'analysis'
          }
        }))
      } catch (error) {
        console.error('Error parsing analysis notification:', error)
      }
    })

    // Fallback for any other message events
    eventSource.onmessage = (event) => {
      console.log('Received unhandled SSE message:', event)
    }

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error)
      setIsConnected(false)

      // Reconnect after 3 seconds
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('Attempting to reconnect SSE...')
        connect()
      }, 3000)
    }
  }

  useEffect(() => {
    connect()

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [])

  return {
    toasts,
    removeToast,
    isConnected
  }
}
