/**
 * Settings page — data management, connections, and advanced tools.
 *
 * Delegates to focused sub-components:
 * - DataManagementSection: clear buttons for individual data stores
 * - RecorderSection: API request recorder toggle and viewer
 */

import { useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog'
import { useAppStore } from '@/stores/app-store'
import { useConversationStore } from '@/stores/conversation-store'
import { useMigrationStore } from '@/stores/migration-store'
import { DataManagementSection } from '@/components/settings/DataManagementSection'
import { RecorderSection } from '@/components/settings/RecorderSection'

export function SettingsPage() {
  const [confirm_action, setConfirmAction] = useState<{ label: string; description: string; fn: () => Promise<void> } | null>(null)

  const disconnect_gpt = useAppStore((s) => s.disconnect_gpt)
  const tracking = useConversationStore((s) => s.tracking)
  const load = useConversationStore((s) => s.load)

  let pushed_count = 0
  tracking.forEach((t) => { if (t.type === 'conversation' && t.status === 'done') pushed_count++ })

  function handle_clear(label: string, description: string, fn: () => Promise<void>) {
    setConfirmAction({ label, description, fn })
  }

  async function execute_clear() {
    if (!confirm_action) return
    const label = confirm_action.label
    await confirm_action.fn()
    setConfirmAction(null)
    toast.success(`${label} cleared`)
    await load()
  }

  async function handle_clear_connections() {
    await disconnect_gpt()
    useMigrationStore.getState().disconnectClaude()
    toast.success('Connections cleared — GPT and Claude disconnected')
    await load()
  }

  return (
    <div>
      <AlertDialog open={!!confirm_action} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear {confirm_action?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm_action?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={execute_clear}>Clear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <h2 className="mb-4 text-lg font-semibold">Settings</h2>

      <DataManagementSection
        pushed_count={pushed_count}
        on_clear={handle_clear}
        on_clear_connections={handle_clear_connections}
      />

      <RecorderSection />
    </div>
  )
}
