/**
 * Memories page — view and select downloaded ChatGPT memories.
 */

import { useMemo, useCallback, useState } from 'react'
import type { RowSelectionState } from '@tanstack/react-table'
import { ChatGPTMemory } from '@lib/sources/chatgpt-memory'
import { markdownToText } from '@lib/transform/markdown-to-text'
import { DataTable } from '@/components/ui/data-table'
import { Card, CardContent } from '@/components/ui/card'
import { PreviewModal } from '@/components/PreviewModal'
import { MarkdownContent } from '@/components/MarkdownContent'
import { ErrorAlertDialog } from '@/components/ErrorAlertDialog'
import { RefreshButton } from '@/components/RefreshButton'
import { useConversationStore } from '@/stores/conversation-store'
import { memoryColumns, type MemoryRow } from '@/columns/memory-columns'
import { SelectionSummary } from '@/components/SelectionSummary'
import { useRefreshPushed } from '@/hooks/useRefreshPushed'

export function MemoriesPage() {
  const memories = useConversationStore((s) => s.memories)
  const tracking = useConversationStore((s) => s.tracking)
  const toggleSelection = useConversationStore((s) => s.toggleSelection)
  const markPushed = useConversationStore((s) => s.markPushed)
  const { refreshing, error, clearError, handleRefreshPushed } = useRefreshPushed()

  const [preview, setPreview] = useState<MemoryRow | null>(null)

  const memoryRows: MemoryRow[] = useMemo(() =>
    (memories ?? []).map((m) => {
      const mem = new ChatGPTMemory(m)
      const t = tracking.get(mem.id)
      return {
        id: mem.id,
        content: mem.content || '',
        created_at: mem.created_at || null,
        pushed: t?.status === 'done',
        raw: m as Record<string, unknown>,
      }
    }),
    [memories, tracking],
  )

  const rowSelection: RowSelectionState = useMemo(() => {
    const sel: RowSelectionState = {}
    for (const row of memoryRows) {
      if (tracking.get(row.id)?.is_selected) sel[row.id] = true
    }
    return sel
  }, [memoryRows, tracking])

  const handleRowSelectionChange = useCallback((updated: RowSelectionState) => {
    for (const row of memoryRows) {
      const wasSelected = Boolean(rowSelection[row.id])
      const isNowSelected = Boolean(updated[row.id])
      if (wasSelected !== isNowSelected) {
        toggleSelection(row.id, isNowSelected)
      }
    }
  }, [memoryRows, rowSelection, toggleSelection])



  return (
    <div>
      <ErrorAlertDialog message={error} onClose={clearError} />

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Memories</h2>
          <p className="text-sm text-muted-foreground">{memoryRows.length} memories downloaded from ChatGPT</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton refreshing={refreshing} onClick={handleRefreshPushed} />
        </div>
      </div>

      {memoryRows.length === 0 ? (
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
          rowSelection={rowSelection}
          onRowSelectionChange={handleRowSelectionChange}
          onRowClick={setPreview}
          footer={<SelectionSummary />}
        />
      )}

      <PreviewModal
        open={!!preview}
        onClose={() => setPreview(null)}
        title="Memory"
        subtitle={preview?.created_at ? `Created: ${new Date(preview.created_at).toLocaleDateString()}` : undefined}
        sentContent={preview ? markdownToText(preview.content) : undefined}
        originalContent={preview?.content}
        rawData={preview?.raw}
        pushContent={preview && !preview.pushed ? preview.content : undefined}
        pushTitle={preview ? `Memory: ${preview.content.slice(0, 50)}...` : undefined}
        onPushed={() => preview && markPushed(preview.id, { pushed_at: new Date().toISOString() })}
      >
        {preview && (
          <div className="text-sm leading-relaxed">
            <MarkdownContent content={preview.content} />
          </div>
        )}
      </PreviewModal>
    </div>
  )
}
