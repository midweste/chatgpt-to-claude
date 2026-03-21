/**
 * UsageBar — Claude rate limit usage display.
 *
 * Shows 5-hour and 7-day utilization bars with reset timers
 * and a last-updated timestamp.
 */

import type { ClaudeUsage } from '@/stores/claude-connection-slice'

interface UsageBarProps {
  usage: ClaudeUsage | null
  on_refresh: () => void
  last_updated?: Date | null
}

export function UsageBar({ usage, on_refresh, last_updated }: UsageBarProps) {
  if (!usage) return null
  return (
    <div className="mt-4 space-y-2">
      <div className="flex gap-4">
        {[{ label: '5-Hour', window: usage.five_hour }, { label: '7-Day', window: usage.seven_day }].map(({ label, window: w }) => {
          if (!w) return null
          const pct = Math.min(w.utilization, 100)
          const resets = new Date(w.resets_at)
          const now = new Date()
          const diff_min = Math.max(0, Math.round((resets.getTime() - now.getTime()) / 60000))
          const time_str = diff_min < 60 ? `${diff_min}m` : `${Math.floor(diff_min / 60)}h ${diff_min % 60}m`
          const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500'
          return (
            <div key={label} className="flex-1">
              <div className="flex justify-between text-xs text-foreground/90 mb-1">
                <span className="font-medium">{label}: {pct.toFixed(0)}%</span>
                <span>resets in {time_str}</span>
              </div>
              <div className="h-2 rounded-full bg-accent/30 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
        <button onClick={on_refresh} className="text-sm text-foreground/50 hover:text-foreground/80 self-end" title="Refresh usage">↻</button>
      </div>
      {last_updated && (
        <div className="text-[11px] text-foreground/50 text-right">
          Updated {last_updated.toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}
