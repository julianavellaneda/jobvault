import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  getAiSettings,
  saveAiSettings,
  testAiConnection,
  type AiSettingsPatch,
  type AiSettingsView,
} from '@/lib/aiSettings'

export interface UseAiSettings {
  data: AiSettingsView | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  save: (patch: AiSettingsPatch) => Promise<boolean>
  test: (patch: AiSettingsPatch) => Promise<boolean>
}

export function useAiSettings(): UseAiSettings {
  const [data, setData] = useState<AiSettingsView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const refetch = useCallback(async () => {
    try {
      const view = await getAiSettings()
      if (!mountedRef.current) return
      setData(view)
      setError(null)
    } catch (e) {
      if (!mountedRef.current) return
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const t = setTimeout(() => {
      void refetch()
    }, 0)
    return () => {
      mountedRef.current = false
      clearTimeout(t)
    }
  }, [refetch])

  const save = useCallback(
    async (patch: AiSettingsPatch): Promise<boolean> => {
      try {
        await saveAiSettings(patch)
        toast.success('AI settings saved')
        await refetch()
        return true
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Save failed')
        return false
      }
    },
    [refetch],
  )

  const test = useCallback(async (patch: AiSettingsPatch): Promise<boolean> => {
    const result = await testAiConnection(patch)
    if (result.ok) {
      toast.success(
        result.sample ? `Connection OK — model replied: "${result.sample}"` : 'Connection OK',
      )
      return true
    }
    toast.error(`Test failed: ${result.error}`)
    return false
  }, [])

  return { data, loading, error, refetch, save, test }
}
