/**
 * Browse page — select conversations, memories, and instructions for migration.
 *
 * Column definitions and filter components live in columns/conversation-columns.tsx.
 */

import { useMemo, useCallback, useState } from 'react'
import type { RowSelectionState } from '@tanstack/react-table'
import { ChatGPTConversation } from '@lib/sources/chatgpt-conversation'
import { ChatGPTMemory } from '@lib/sources/chatgpt-memory'
import { ChatGPTInstruction } from '@lib/sources/chatgpt-instruction'
import { formatTranscript } from '@lib/transform/gpt-to-claude'
import { prepareConversationMessage } from '@lib/transform/prepare-push-message'
import { logger } from '@lib/services/logger'
import { RotateCcw } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PreviewModal } from '@/components/PreviewModal'
import { ConversationPreviewContent } from '@/components/ConversationPreviewContent'
import { ErrorAlertDialog } from '@/components/ErrorAlertDialog'
import { RefreshButton } from '@/components/RefreshButton'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { useConversationStore, buildConvProjectMap } from '@/stores/conversation-store'
import { buildConversationColumns, buildConversationRows } from '@/columns/conversation-columns'
import { memoryColumns, type MemoryRow } from '@/columns/memory-columns'
import { instructionColumns, type InstructionRow } from '@/columns/instruction-columns'
import { useMigrationStore } from '@/stores/migration-store'
import { useRefreshPushed } from '@/hooks/useRefreshPushed'

export function BrowsePage() {
  const conversations = useConversationStore((s) => s.conversations)
  const memories = useConversationStore((s) => s.memories)
  const instructions = useConversationStore((s) => s.instructions)
  const tracking = useConversationStore((s) => s.tracking)
  const projects = useConversationStore((s) => s.projects)
  const toggleSelection = useConversationStore((s) => s.toggleSelection)
  const reset_pushed = useConversationStore((s) => s.reset_pushed)
  const { refreshing, error, clearError, handleRefreshPushed } = useRefreshPushed()
  const convProjectMap = useMemo(() => buildConvProjectMap(projects), [projects])

  const push_format = useMigrationStore((s) => s.push_format)
  const prompt_prefix = useMigrationStore((s) => s.prompt_prefix)
  const prompt_suffix = useMigrationStore((s) => s.prompt_suffix)

  const [active_tab, setActiveTab] = useState<'conversations' | 'memories' | 'instructions'>('conversations')
  const [show_reset_dialog, setShowResetDialog] = useState(false)
  const [preview_raw, setPreviewRaw] = useState<Record<string, unknown> | null>(null)

  let pushed_count = 0
  tracking.forEach((t) => { if (t.type === 'conversation' && t.status === 'done') pushed_count++ })

  const projectOptions = useMemo(() =>
    [...new Set(projects.map((p) => p.name))],
    [projects],
  )

  // Wrap raw conversations for the DataTable
  const conv_rows = useMemo(() =>
    buildConversationRows(conversations, tracking),
    [conversations, tracking],
  )

  // Build row selection state from tracking
  const rowSelection = useMemo(() => {
    const sel: RowSelectionState = {}
    for (const row of conv_rows) {
      if (row.is_selected && row.status !== 'done') sel[row.id] = true
    }
    return sel
  }, [conv_rows])

  const handleRowSelectionChange = useCallback((updated: RowSelectionState) => {
    for (const row of conv_rows) {
      const wasSelected = Boolean(rowSelection[row.id])
      const isNowSelected = Boolean(updated[row.id])
      if (wasSelected !== isNowSelected) {
        toggleSelection(row.id, isNowSelected)
      }
    }
  }, [conv_rows, rowSelection, toggleSelection])

  async function handle_reset_pushed() {
    const count = await reset_pushed('conversation')
    await logger.info('connect', `Reset ${count} pushed conversation(s)`)
    setShowResetDialog(false)
  }



  // ── Column definitions (via imported builder) ────────────────────

  const columns = useMemo(
    () => buildConversationColumns(convProjectMap, projectOptions),
    [convProjectMap, projectOptions],
  )

  const memoryRows = useMemo<MemoryRow[]>(() =>
    (memories ?? []).map((raw) => {
      const mem = new ChatGPTMemory(raw)
      return {
        id: mem.id,
        content: mem.content,
        created_at: mem.created_at || null,
        raw: raw as Record<string, unknown>,
      }
    }),
    [memories],
  )

  const instructionRows = useMemo<InstructionRow[]>(() => {
    if (!instructions) return []
    const inst = new ChatGPTInstruction(instructions)
    const rows: InstructionRow[] = []
    if (inst.about_user) {
      rows.push({ id: 'about_user', section: 'About You', content: inst.about_user, raw: { section: 'About You', content: inst.about_user } })
    }
    if (inst.about_model) {
      rows.push({ id: 'about_model', section: 'Response Style', content: inst.about_model, raw: { section: 'Response Style', content: inst.about_model } })
    }
    return rows
  }, [instructions])

  const summary = useMemo(() => {
    const selected = conv_rows.filter((c) => c.is_selected && c.status !== 'done')
    return {
      count: selected.length,
    }
  }, [conv_rows])

  const preview_conv = preview_raw ? new ChatGPTConversation(preview_raw) : null

  return (
    <div>
      <AlertDialog open={show_reset_dialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Pushed Conversations</AlertDialogTitle>
            <AlertDialogDescription>
              This will reset {pushed_count} pushed conversation{pushed_count !== 1 ? 's' : ''} back
              to &quot;extracted&quot; status, allowing them to be selected and pushed to Claude again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button onClick={handle_reset_pushed}>Reset</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ErrorAlertDialog message={error} onClose={clearError} />

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Select Conversations</h2>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div className="inline-flex rounded-lg border bg-muted p-0.5">
          <button
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              active_tab === 'conversations'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('conversations')}
          >
            Conversations ({conversations.length})
          </button>
          <button
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              active_tab === 'memories'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('memories')}
          >
            Memories ({(memories ?? []).length})
          </button>
          <button
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              active_tab === 'instructions'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('instructions')}
          >
            Instructions ({instructionRows.length})
          </button>
        </div>

        {active_tab === 'conversations' && pushed_count > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{pushed_count} pushed</span>
            <Button variant="outline" size="sm" onClick={() => setShowResetDialog(true)}>
              <RotateCcw className="mr-1 h-3 w-3" />
              Reset
            </Button>
            <RefreshButton refreshing={refreshing} onClick={handleRefreshPushed} label="Refresh" />
          </div>
        )}
        {active_tab === 'conversations' && pushed_count === 0 && (
          <RefreshButton refreshing={refreshing} onClick={handleRefreshPushed} />
        )}
      </div>

      <div className="mt-4">
        {active_tab === 'conversations' && (
          <>
          {conversations.length === 0 ? (
            <Card>
              <CardContent>
                <p className="text-sm text-muted-foreground">No conversations downloaded yet. Go to Download first.</p>
              </CardContent>
            </Card>
          ) : (
            <DataTable
              columns={columns}
              data={conv_rows}
              getRowId={(row) => row.id}
              enableRowSelection={(row) => row.original.status !== 'done'}
              rowSelection={rowSelection}
              onRowSelectionChange={handleRowSelectionChange}
              onRowClick={(row) => setPreviewRaw(row.raw)}
              footer={
                <div className="text-sm text-muted-foreground">
                  {summary.count} selected for migration
                </div>
              }
            />
          )}
          </>
        )}

        {active_tab === 'memories' && (
          <>
          {(memories ?? []).length === 0 ? (
            <Card>
              <CardContent>
                <p className="text-sm text-muted-foreground">No memories downloaded.</p>
              </CardContent>
            </Card>
          ) : (
            <DataTable
              columns={memoryColumns}
              data={memoryRows}
              getRowId={(row) => row.id}
            />
          )}
          </>
        )}

        {active_tab === 'instructions' && (
          <>
          {instructionRows.length === 0 ? (
            <Card>
              <CardContent>
                <p className="text-sm text-muted-foreground">No custom instructions downloaded.</p>
              </CardContent>
            </Card>
          ) : (
            <DataTable
              columns={instructionColumns}
              data={instructionRows}
              getRowId={(row) => row.id}
            />
          )}
          </>
        )}
      </div>

      {/* Conversation preview modal */}
      {preview_conv && (() => {
        const mapping = preview_raw?.mapping as Record<string, Record<string, unknown>> | undefined
        return (
          <PreviewModal
            open
            onClose={() => setPreviewRaw(null)}
            title={preview_conv.title}
            subtitle={`${preview_conv.message_count} messages${preview_conv.created_at ? ` · ${preview_conv.created_at}` : ''}`}
            rawData={mapping}
            sentContent={prepareConversationMessage(preview_conv, { push_format, prompt_prefix, prompt_suffix })}
            originalContent={formatTranscript(preview_conv)}
          >
            <ConversationPreviewContent mapping={mapping} />
          </PreviewModal>
        )
      })()}
    </div>
  )
}
