/**
 * useRefreshPushed — hook for refreshing pushed status from Claude.
 *
 * Encapsulates the refresh-pushed-with-error-handling pattern
 * shared by ConversationsPage, BrowsePage, MemoriesPage, InstructionsPage.
 */

import { useState, useCallback } from 'react'
import { useConversationStore } from '@/stores/conversation-store'
import { useMigrationStore } from '@/stores/migration-store'

export interface RefreshPushedState {
  refreshing: boolean
  error: string
  clearError: () => void
  handleRefreshPushed: () => Promise<void>
}

export function useRefreshPushed(): RefreshPushedState {
  const refreshPushed = useConversationStore((s) => s.refreshPushed)
  const claude = useMigrationStore((s) => s.claude)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const handleRefreshPushed = useCallback(async () => {
    setRefreshing(true)
    try {
      if (!claude) throw new Error('Not connected to Claude')
      await refreshPushed(claude)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Could not refresh from Claude: ${msg}`)
    } finally {
      setRefreshing(false)
    }
  }, [refreshPushed, claude])

  const clearError = useCallback(() => setError(''), [])

  return { refreshing, error, clearError, handleRefreshPushed }
}
