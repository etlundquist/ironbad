import { useState, useEffect } from 'react'
import { Contract } from '../lib/types'
import { fetchContract } from '../lib/api'

export function useContract(id: string | string[] | undefined) {
  const [contract, setContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = async () => {
    if (!id || Array.isArray(id)) return

    try {
      setLoading(true)
      setError(null)
      const data = await fetchContract(id)
      setContract(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refetch()
  }, [id])

  return { contract, loading, error, refetch, setContract }
}

