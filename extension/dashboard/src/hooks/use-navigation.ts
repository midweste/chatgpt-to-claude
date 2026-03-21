/**
 * Navigation gating logic — determines which pages are unlocked,
 * which is the next step, and which are completed.
 */

import type { Page } from '../stores/app-store'
import { useAppStore } from '../stores/app-store'
import { useConversationStore, selectSelectedCount, selectHasData } from '../stores/conversation-store'
import { useMigrationStore } from '../stores/migration-store'

export function useNavigation() {
  const is_connected = useAppStore((s) => s.is_connected)
  const has_data = useConversationStore(selectHasData)
  const selected_count = useConversationStore(selectSelectedCount)
  const claude_connected = useMigrationStore((s) => s.claude_status) === 'connected'

  function is_unlocked(id: Page): boolean {
    switch (id) {
      case 'connect': return true
      case 'extract': return is_connected
      case 'claude': return has_data
      case 'conversations':
      case 'memory-export':
      case 'instructions-export':
        return has_data && claude_connected
      case 'settings':
      case 'logs':
        return true
      default: return false
    }
  }

  function is_next_step(id: Page): boolean {
    if (id === 'extract') return is_connected && !has_data
    if (id === 'conversations') return has_data && selected_count === 0
    return false
  }

  function is_completed(id: Page): boolean {
    if (id === 'connect') return is_connected
    if (id === 'extract') return has_data
    return false
  }

  return {
    is_unlocked,
    is_next_step,
    is_completed,
    has_data,
    selected_count,
  }
}
