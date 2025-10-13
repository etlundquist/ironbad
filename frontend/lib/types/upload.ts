export interface UploadedContract {
  id: string
  contractId?: string
  filename: string
  status: 'uploading' | 'success' | 'error'
  error?: string
}

