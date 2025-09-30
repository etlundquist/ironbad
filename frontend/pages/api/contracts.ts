import { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import fs from 'fs'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB
      filter: ({ mimetype }) => {
        return mimetype === 'application/pdf' ||
               mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }
    })

    const [fields, files] = await form.parse(req)
    const file = Array.isArray(files.file) ? files.file[0] : files.file

    if (!file) {
      return res.status(400).json({ error: 'No file provided' })
    }

    // Read the file
    const fileBuffer = fs.readFileSync(file.filepath)

    // Create FormData for backend
    const formData = new FormData()
    formData.append('file', new Blob([fileBuffer]), file.originalFilename || 'contract.pdf')

    // Forward to backend
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'
    const backendResponse = await fetch(`${backendUrl}/contracts`, {
      method: 'POST',
      body: formData
    })

    const result = await backendResponse.json()

    if (!backendResponse.ok) {
      return res.status(backendResponse.status).json(result)
    }

    // Clean up temporary file
    fs.unlinkSync(file.filepath)

    return res.status(200).json(result)
  } catch (error) {
    console.error('Upload error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
