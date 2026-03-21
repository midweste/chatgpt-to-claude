/**
 * PushButton — push single item to Claude from preview modal footer.
 *
 * Shows push button when connected to Claude, disabled hint when not.
 * Handles loading/success/error states inline.
 */

import { useState } from 'react'
import { Send, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMigrationStore } from '@/stores/migration-store'

interface PushButtonProps {
  /** Content to push to Claude */
  content: string
  /** Title for the Claude conversation */
  title: string
  /** Claude project to place the conversation into (falls back to default_project setting) */
  projectName?: string
  /** Called after successful push with the Claude conversation UUID */
  onPushed?: (claude_uuid: string) => void
}

export function PushButton({ content, title, projectName, onPushed }: PushButtonProps) {
  const claude_status = useMigrationStore((s) => s.claude_status)
  const push_content = useMigrationStore((s) => s.push_content)

  const [state, setState] = useState<'idle' | 'pushing' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  if (claude_status !== 'connected') {
    return (
      <span className="text-xs text-muted-foreground">
        Connect to Claude to push
      </span>
    )
  }

  if (state === 'done') {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
        <Check className="h-3 w-3" /> Pushed to Claude
      </span>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {state === 'error' && (
        <span className="text-xs text-destructive max-w-xs truncate">{error}</span>
      )}
      <Button
        size="sm"
        disabled={state === 'pushing'}
        onClick={async () => {
          setState('pushing')
          setError('')
          try {
            const uuid = await push_content(content, title, projectName)
            setState('done')
            onPushed?.(uuid)
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
            setState('error')
          }
        }}
        className="gap-1"
      >
        {state === 'pushing' ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Send className="h-3 w-3" />
        )}
        {state === 'pushing' ? 'Pushing...' : 'Push to Claude'}
      </Button>
    </div>
  )
}
