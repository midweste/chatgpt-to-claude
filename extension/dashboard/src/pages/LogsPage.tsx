import { useState, useEffect, useMemo, useCallback } from 'react'
import type { ColumnDef, Column } from '@tanstack/react-table'
import { getLogs, clear_logs } from '@lib/services/logger'
import type { LogEntry } from '@lib/services/logger'
import { DataTable } from '@/components/ui/data-table'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PreviewModal } from '@/components/PreviewModal'
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
import { Trash2, Copy, Check, Bug } from 'lucide-react'
import { TextFilter, SelectFilter, SortableHeader } from '@/columns/column-filters'

const level_colors: Record<string, string> = {
  debug: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  info: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  warn: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  error: 'bg-red-500/10 text-red-500 border-red-500/20',
}

const level_order: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 }

const LOG_COLUMNS: ColumnDef<LogEntry>[] = [
  {
    accessorKey: 'timestamp',
    header: ({ column }) => <SortableHeader column={column}>Time</SortableHeader>,
    size: 160,
    cell: ({ getValue }) => (
      <span className="whitespace-nowrap font-mono text-sm">
        {new Date(getValue() as string).toLocaleString()}
      </span>
    ),
  },
  {
    accessorKey: 'level',
    header: ({ column }) => <SortableHeader column={column}>Level</SortableHeader>,
    size: 70,
    cell: ({ getValue }) => {
      const level = getValue() as string
      return <Badge variant="outline" className={level_colors[level] || ''}>{level}</Badge>
    },
    meta: {
      filterComponent: ({ column }: { column: Column<LogEntry> }) => (
        <SelectFilter column={column} options={['debug', 'info', 'warn', 'error']} />
      ),
    },
  },
  {
    accessorKey: 'source',
    header: ({ column }) => <SortableHeader column={column}>Source</SortableHeader>,
    size: 100,
    cell: ({ getValue }) => <span className="font-mono text-sm">{getValue() as string}</span>,
    meta: {
      filterComponent: ({ column }: { column: Column<LogEntry> }) => (
        <SelectFilter column={column} options={['connect', 'extract', 'migrate']} />
      ),
    },
  },
  {
    accessorKey: 'message',
    header: ({ column }) => <SortableHeader column={column}>Message</SortableHeader>,
    cell: ({ getValue }) => (
      <span className="text-sm text-foreground truncate block max-w-lg">{getValue() as string}</span>
    ),
    meta: {
      filterComponent: ({ column }: { column: Column<LogEntry> }) => <TextFilter column={column} />,
    },
  },
]

type MinLevel = 'debug' | 'info'

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [show_clear_dialog, setShowClearDialog] = useState(false)
  const [preview, setPreview] = useState<LogEntry | null>(null)
  const [copied, setCopied] = useState(false)
  const [min_level, setMinLevel] = useState<MinLevel>('info')

  async function refresh() {
    setLoading(true)
    const entries = await getLogs()
    setLogs(entries.reverse()) // newest first
    setLoading(false)
  }

  useEffect(() => {
    void (async () => { await refresh() })()
  }, [])

  const filtered_logs = useMemo(() => {
    const threshold = level_order[min_level]
    return logs.filter((log) => (level_order[log.level] ?? 0) >= threshold)
  }, [logs, min_level])

  const handle_copy = useCallback(async () => {
    const text = filtered_logs
      .map((log) => `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.source}] ${log.message}`)
      .join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [filtered_logs])

  async function handle_clear() {
    await clear_logs()
    setLogs([])
    setShowClearDialog(false)
  }

  return (
    <div>
      <AlertDialog open={show_clear_dialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Logs</AlertDialogTitle>
            <AlertDialogDescription>
              Clear all logs? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handle_clear}>Clear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Logs</h2>
        <div className="flex items-center gap-2">
          <Button
            variant={min_level === 'debug' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMinLevel(min_level === 'debug' ? 'info' : 'debug')}
            title={min_level === 'debug' ? 'Showing all levels (debug+)' : 'Showing info+ only — click to include debug'}
          >
            <Bug className="mr-1 h-3 w-3" />
            {min_level === 'debug' ? 'Debug On' : 'Debug Off'}
          </Button>
          <Button variant="outline" size="sm" onClick={refresh}>
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handle_copy}
            disabled={filtered_logs.length === 0}
          >
            {copied ? (
              <>
                <Check className="mr-1 h-3 w-3 text-green-500" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="mr-1 h-3 w-3" />
                Copy
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowClearDialog(true)}
            disabled={logs.length === 0}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Clear
          </Button>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent>
            <p className="text-sm text-foreground/50">Loading...</p>
          </CardContent>
        </Card>
      ) : filtered_logs.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-foreground/50">No logs yet. Logs are recorded during connection, extraction, and migration operations.</p>
          </CardContent>
        </Card>
      ) : (
        <DataTable
          columns={LOG_COLUMNS}
          data={filtered_logs}
          onRowClick={setPreview}
          footer={<span className="text-sm text-muted-foreground">{filtered_logs.length} log entries{min_level === 'info' && logs.length !== filtered_logs.length ? ` (${logs.length - filtered_logs.length} debug hidden)` : ''}</span>}
        />
      )}

      <PreviewModal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview ? `${preview.level.toUpperCase()} — ${preview.source}` : ''}
        subtitle={preview ? new Date(preview.timestamp).toLocaleString() : undefined}
      >
        {preview && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">{preview.message}</p>
        )}
      </PreviewModal>
    </div>
  )
}
