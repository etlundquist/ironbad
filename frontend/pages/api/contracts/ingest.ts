import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { contract_ids } = req.body

    if (!contract_ids || !Array.isArray(contract_ids)) {
      return res.status(400).json({ error: 'contract_ids array is required' })
    }

    // Forward to backend
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'
    const backendResponse = await fetch(`${backendUrl}/contracts/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ contract_ids })
    })

    const result = await backendResponse.json()

    if (!backendResponse.ok) {
      return res.status(backendResponse.status).json(result)
    }

    return res.status(200).json(result)
  } catch (error) {
    console.error('Ingestion error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
