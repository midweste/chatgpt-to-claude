/**
 * PushControls — start/pause/resume/cancel/retry buttons + progress bar.
 */

import { Send, Pause, Play, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { MigrationStatus } from '@/types/status-types'
import type { QueueItem, PushResultRow } from '@/stores/migration-store'

interface PushControlsProps {
  queue_items: QueueItem[]
  status: MigrationStatus
  results: PushResultRow[]
  error_count: number
  on_push: () => void
  on_pause: () => void
  on_resume: () => void
  on_cancel: () => void
  on_retry: () => void
  on_reset: () => void
}

export function PushControls({
  queue_items,
  status,
  results,
  error_count,
  on_push,
  on_pause,
  on_resume,
  on_cancel,
  on_retry,
  on_reset,
}: PushControlsProps) {
  const total_count = results.length > 0 ? results.length : queue_items.length
  const progress = results.filter((r) => r.status === 'done' || r.status === 'pushing').length
  const done_count = results.filter((r) => r.status === 'done').length
  const error = error_count > 0 ? `${error_count} item${error_count !== 1 ? 's' : ''} failed` : ''
  const has_active_session = status !== 'idle' || results.length > 0

  if (queue_items.length === 0 && !has_active_session) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-foreground/70">
            Nothing selected for migration. Go to Select and choose items to push.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              {queue_items.length > 0 && status !== 'running' && status !== 'paused' && (
                <p className="text-sm text-foreground/70">{queue_items.length} items ready to push</p>
              )}
              {status === 'running' && (
                <p className="text-sm">Pushing {progress}/{total_count}...</p>
              )}
              {status === 'paused' && (
                <p className="text-sm text-amber-600">Paused at {progress}/{total_count}</p>
              )}
              {status === 'done' && done_count > 0 && (
                <p className="text-sm text-green-600 font-medium">✓ {done_count} pushed to Claude</p>
              )}
            </div>

            <div className="flex gap-2">
              {queue_items.length > 0 && status !== 'running' && status !== 'paused' && (
                <Button onClick={on_push} className="gap-2">
                  <Send className="h-4 w-4" /> Push to Claude
                </Button>
              )}
              {status === 'running' && (
                <>
                  <Button variant="outline" size="sm" onClick={on_pause}>
                    <Pause className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={on_cancel}>
                    Cancel
                  </Button>
                </>
              )}
              {status === 'paused' && (
                <>
                  <Button variant="outline" size="sm" onClick={on_resume}>
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={on_cancel}>
                    Cancel
                  </Button>
                </>
              )}
              {status === 'done' && !error && (
                <Button variant="outline" onClick={on_reset}>
                  Reset
                </Button>
              )}
              {error && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1" onClick={on_retry}>
                    <RotateCcw className="h-3 w-3" /> Retry Failed
                  </Button>
                  <Button variant="outline" size="sm" onClick={on_reset}>
                    Reset
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {(status === 'running' || status === 'paused') && (
            <div className="mt-3 h-1.5 w-full rounded-full bg-foreground/10">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  status === 'paused' ? 'bg-amber-500' : 'bg-foreground'
                }`}
                style={{ width: `${total_count > 0 ? Math.min((progress / total_count) * 100, 100) : 0}%` }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error summary */}
      {error_count > 0 && status === 'done' && (
        <Card className="border-destructive/50">
          <CardContent>
            <p className="text-sm text-destructive">
              {error_count} conversation{error_count !== 1 ? 's' : ''} failed. Click "Retry Failed" to attempt again.
            </p>
          </CardContent>
        </Card>
      )}
    </>
  )
}
