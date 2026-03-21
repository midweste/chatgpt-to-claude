/**
 * Conversations page — select conversations and push to Claude.
 *
 * Combines conversation selection (DataTable) with push-to-Claude controls.
 * Column definitions live in columns/conversation-columns.tsx.
 */

import { useMemo, useCallback, useState, useEffect } from 'react'
import type { RowSelectionState } from '@tanstack/react-table'
import { ChatGPTConversation } from '@lib/sources/chatgpt-conversation'
import { formatTranscript } from '@lib/transform/gpt-to-claude'
import { prepareConversationMessage } from '@lib/transform/prepare-push-message'
import { DataTable } from '@/components/ui/data-table'
import { Card, CardContent } from '@/components/ui/card'
import { PreviewModal } from '@/components/PreviewModal'
import { ConversationPreviewContent } from '@/components/ConversationPreviewContent'
import { ErrorAlertDialog } from '@/components/ErrorAlertDialog'
import { RefreshButton } from '@/components/RefreshButton'

import { useConversationStore, buildConvProjectMap } from '@/stores/conversation-store'
import { useMigrationStore } from '@/stores/migration-store'
import { buildConversationColumns, buildConversationRows } from '@/columns/conversation-columns'
import { SelectionSummary } from '@/components/SelectionSummary'
import { useRefreshPushed } from '@/hooks/useRefreshPushed'
import { UsageBar } from '@/components/migrate/UsageBar'
import { PushControls } from '@/components/migrate/PushControls'
import type { QueueItem } from '@/stores/migration-store'

export function ConversationsPage() {
  const conversations = useConversationStore((s) => s.conversations)
  const tracking = useConversationStore((s) => s.tracking)
  const projects = useConversationStore((s) => s.projects)
  const toggleSelection = useConversationStore((s) => s.toggleSelection)
  const markPushed = useConversationStore((s) => s.markPushed)
  const refresh = useConversationStore((s) => s.refresh)
  const refreshPushed = useConversationStore((s) => s.refreshPushed)
  const { refreshing, error, clearError, handleRefreshPushed } = useRefreshPushed()

  const push_format = useMigrationStore((s) => s.push_format)
  const prompt_prefix = useMigrationStore((s) => s.prompt_prefix)
  const prompt_suffix = useMigrationStore((s) => s.prompt_suffix)

  const claude_status = useMigrationStore((s) => s.claude_status)
  const usage = useMigrationStore((s) => s.usage)
  const fetchUsage = useMigrationStore((s) => s.fetchUsage)
  const status = useMigrationStore((s) => s.status)
  const results = useMigrationStore((s) => s.results)
  const pause = useMigrationStore((s) => s.pause)
  const resume = useMigrationStore((s) => s.resume)
  const cancel = useMigrationStore((s) => s.cancel)
  const retry_failed = useMigrationStore((s) => s.retry_failed)
  const reset = useMigrationStore((s) => s.reset)

  const [usage_updated, setUsageUpdated] = useState<Date | null>(null)

  const conv_project_map = useMemo(() => buildConvProjectMap(projects), [projects])

  const [preview_raw, setPreviewRaw] = useState<Record<string, unknown> | null>(null)

  // Usage polling — refresh every 60s while Claude is connected
  const refresh_usage = useCallback(async () => {
    await fetchUsage()
    setUsageUpdated(new Date())
  }, [fetchUsage])

  useEffect(() => {
    if (claude_status !== 'connected') return
    void (async () => { await refresh_usage() })()
    const id = setInterval(refresh_usage, 60_000)
    return () => clearInterval(id)
  }, [claude_status, refresh_usage])

  // Build queue from selected, unpushed conversations
  const queue_items = useMemo<QueueItem[]>(() => {
    return conversations
      .filter((c) => {
        const id = (c.id ?? c.conversation_id ?? '') as string
        const t = tracking.get(id)
        return t?.is_selected && t.status !== 'done'
      })
      .map((c) => new ChatGPTConversation(c))
      .sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''))
      .map((c) => ({
        id: c.id,
        type: 'Conversation' as const,
        title: c.title || 'Untitled',
        detail: conv_project_map.get(c.id) || '—',
        messages: c.message_count,
        raw: c.data,
      }))
  }, [conversations, tracking, conv_project_map])

  const error_count = results.filter((r) => r.status === 'error').length

  const handle_push = async () => {
    if (queue_items.length === 0) return
    const conv_wrappers = queue_items.map((q) => new ChatGPTConversation(q.raw!))
    const start = useMigrationStore.getState().start_migration
    await start(conv_wrappers, projects)
    await refresh()
    const claude = useMigrationStore.getState().claude
    if (claude) await refreshPushed(claude)
  }

  // Wrap raw conversations for the DataTable — provide typed rows
  const conv_rows = useMemo(() =>
    buildConversationRows(conversations, tracking),
    [conversations, tracking],
  )

  const rowSelection: RowSelectionState = useMemo(() => {
    const sel: RowSelectionState = {}
    for (const row of conv_rows) {
      if (row.is_selected && row.status !== 'done') sel[row.id] = true
    }
    return sel
  }, [conv_rows])

  const projectOptions = useMemo(() =>
    [...new Set(projects.map((p) => p.name))],
    [projects],
  )

  const columns = useMemo(
    () => buildConversationColumns(conv_project_map, projectOptions),
    [conv_project_map, projectOptions],
  )

  const handleRowSelectionChange = useCallback((updated: RowSelectionState) => {
    for (const row of conv_rows) {
      const wasSelected = Boolean(rowSelection[row.id])
      const isNowSelected = Boolean(updated[row.id])
      if (wasSelected !== isNowSelected) {
        toggleSelection(row.id, isNowSelected)
      }
    }
  }, [conv_rows, rowSelection, toggleSelection])

  const preview_conv = preview_raw ? new ChatGPTConversation(preview_raw) : null

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col overflow-hidden">
      <ErrorAlertDialog message={error} onClose={clearError} />

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Conversations</h2>
          <p className="text-sm text-muted-foreground">{conversations.length} conversations downloaded from ChatGPT</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton refreshing={refreshing} onClick={handleRefreshPushed} />
        </div>
      </div>

      {claude_status === 'connected' && (
        <UsageBar usage={usage} on_refresh={refresh_usage} last_updated={usage_updated} />
      )}

      {conversations.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">No conversations downloaded yet. Go to Download first.</p>
          </CardContent>
        </Card>
      ) : (
        <DataTable
          className="min-h-0 flex-1 flex flex-col"
          columns={columns}
          data={conv_rows}
          initialSorting={[{ id: 'created_at', desc: true }]}
          getRowId={(row) => row.id}
          enableRowSelection={(row) => row.original.status !== 'done'}
          rowSelection={rowSelection}
          onRowSelectionChange={handleRowSelectionChange}
          onRowClick={(row) => setPreviewRaw(row.raw)}
          footer={<SelectionSummary />}
        />
      )}

      {claude_status === 'connected' && (
        <div className="mt-4">
          <PushControls
            queue_items={queue_items}
            status={status}
            results={results}
            error_count={error_count}
            on_push={handle_push}
            on_pause={pause}
            on_resume={resume}
            on_cancel={cancel}
            on_retry={() => retry_failed(conversations.map((c) => new ChatGPTConversation(c)), projects, refresh)}
            on_reset={() => reset()}
          />
        </div>
      )}

      <PreviewModal
        open={!!preview_conv}
        onClose={() => setPreviewRaw(null)}
        title={preview_conv?.title || ''}
        subtitle={preview_conv ? `${preview_conv.message_count} messages${preview_conv.created_at ? ` · ${preview_conv.created_at}` : ''}` : undefined}
        rawData={preview_raw?.mapping}
        sentContent={preview_conv ? prepareConversationMessage(preview_conv, { push_format, prompt_prefix, prompt_suffix }) : undefined}
        originalContent={preview_conv ? formatTranscript(preview_conv) : undefined}
        pushContent={preview_conv && tracking.get(preview_conv.id)?.status !== 'done'
          ? prepareConversationMessage(preview_conv, { push_format, prompt_prefix, prompt_suffix })
          : undefined}
        pushTitle={preview_conv?.title}
        pushProjectName={preview_conv ? conv_project_map.get(preview_conv.id) : undefined}
        onPushed={(uuid) => {
          if (preview_conv) {
            markPushed(preview_conv.id, { pushed_at: new Date().toISOString(), claude_id: uuid })
          }
        }}
      >
        {preview_raw && (() => {
          const mapping = preview_raw.mapping as Record<string, Record<string, unknown>> | undefined
          return <ConversationPreviewContent mapping={mapping} />
        })()}
      </PreviewModal>
    </div>
  )
}

