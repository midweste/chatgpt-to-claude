/**
 * DataManagementSection — clear buttons for individual data stores.
 *
 * Renders a card with clear actions for conversations, memories, instructions,
 * tracking, migration state, logs, settings, connections, and a destructive "clear all".
 */

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  clearAll,
  clearConversations,
  clearMemories,
  clearInstructions,
  clearMigrationState,
  clearTracking,
  clearLogs,
  clearSettings,
} from '@lib/storage'
import { useMigrationStore } from '@/stores/migration-store'

interface ClearRowProps {
  /** Display label for the data store */
  label: string
  /** Brief description of what gets cleared */
  description: string
  /** Variant for the action button */
  variant?: 'outline' | 'destructive'
  /** Button label text */
  button_label?: string
  /** Handler called when action is confirmed */
  on_click: () => void
}

function ClearRow({ label, description, variant = 'outline', button_label = 'Clear', on_click }: ClearRowProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className={`text-sm font-medium ${variant === 'destructive' ? 'text-destructive' : ''}`}>{label}</p>
        <p className="text-xs text-foreground/50">{description}</p>
      </div>
      <Button variant={variant} size="sm" onClick={on_click}>
        {button_label}
      </Button>
    </div>
  )
}

interface DataManagementSectionProps {
  pushed_count: number
  on_clear: (label: string, description: string, fn: () => Promise<void>) => void
  on_clear_connections: () => void
}

export function DataManagementSection({ pushed_count, on_clear, on_clear_connections }: DataManagementSectionProps) {
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-base">Data Management</CardTitle>
        <CardDescription>Clear individual data stores or reset everything. These actions cannot be undone.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <ClearRow
            label="Connections"
            description="Disconnect ChatGPT token and Claude session cookie"
            button_label="Disconnect"
            on_click={on_clear_connections}
          />

          <div className="border-t" />

          <ClearRow
            label="Conversations"
            description="Downloaded ChatGPT conversation data — you'll need to re-download"
            on_click={() => on_clear('Conversations', 'This will delete all downloaded ChatGPT conversations. You will need to re-download them.', clearConversations)}
          />

          <ClearRow
            label="Memories"
            description="Downloaded ChatGPT memories — you'll need to re-download"
            on_click={() => on_clear('Memories', 'This will delete all downloaded ChatGPT memories. You will need to re-download them.', clearMemories)}
          />

          <ClearRow
            label="Instructions"
            description="Downloaded ChatGPT custom instructions — you'll need to re-download"
            on_click={() => on_clear('Instructions', 'This will delete all downloaded ChatGPT custom instructions. You will need to re-download them.', clearInstructions)}
          />

          <ClearRow
            label="Tracking"
            description={`Selection state and push status for all items (${pushed_count} pushed)`}
            on_click={() => on_clear('Tracking', 'This will reset all selection state and push status. Items will need to be re-selected.', clearTracking)}
          />

          <ClearRow
            label="Migration State"
            description="Download progress tracking — reset if extraction gets stuck"
            on_click={() => on_clear('Migration State', 'This will reset download/extraction progress. Use this if an extraction gets stuck.', clearMigrationState)}
          />

          <ClearRow
            label="Logs"
            description="Activity log entries shown on the Logs page"
            on_click={() => on_clear('Logs', 'This will delete all log entries.', clearLogs)}
          />

          <ClearRow
            label="Settings"
            description="Preferences like Claude model, name prefix, prompt prefix, download format"
            on_click={() => on_clear('Settings', 'This will reset your preferences (model, name prefix, prompt prefix, format) back to defaults.', async () => {
              await clearSettings()
              useMigrationStore.getState().reset_preferences()
            })}
          />

          <div className="border-t pt-3">
            <ClearRow
              label="Clear All Data"
              description="Delete everything above and start fresh"
              variant="destructive"
              button_label="Clear All"
              on_click={() => on_clear('All Data', 'This will permanently delete all data — conversations, memories, instructions, tracking, logs, settings, and connections. You will start completely fresh.', async () => {
                await clearAll()
                useMigrationStore.getState().reset_preferences()
              })}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
