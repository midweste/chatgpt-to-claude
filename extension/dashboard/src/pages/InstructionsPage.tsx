/**
 * Instructions page — view and select downloaded ChatGPT custom instructions.
 */

import { useMemo, useCallback, useState } from 'react'
import type { RowSelectionState } from '@tanstack/react-table'
import { ChatGPTInstruction } from '@lib/sources/chatgpt-instruction'
import { markdownToText } from '@lib/transform/markdown-to-text'
import { DataTable } from '@/components/ui/data-table'
import { Card, CardContent } from '@/components/ui/card'
import { PreviewModal } from '@/components/PreviewModal'
import { MarkdownContent } from '@/components/MarkdownContent'
import { ErrorAlertDialog } from '@/components/ErrorAlertDialog'
import { RefreshButton } from '@/components/RefreshButton'
import { useConversationStore } from '@/stores/conversation-store'
import { instructionColumns, type InstructionRow } from '@/columns/instruction-columns'
import { SelectionSummary } from '@/components/SelectionSummary'
import { useRefreshPushed } from '@/hooks/useRefreshPushed'

export function InstructionsPage() {
  const instructions = useConversationStore((s) => s.instructions)
  const tracking = useConversationStore((s) => s.tracking)
  const toggleSelection = useConversationStore((s) => s.toggleSelection)
  const markPushed = useConversationStore((s) => s.markPushed)
  const { refreshing, error, clearError, handleRefreshPushed } = useRefreshPushed()

  const [preview, setPreview] = useState<InstructionRow | null>(null)

  const instructionRows: InstructionRow[] = useMemo(() => {
    if (!instructions) return []
    const inst = new ChatGPTInstruction(instructions)
    const rows: InstructionRow[] = []
    if (inst.about_user) {
      rows.push({
        id: 'about-user',
        section: 'About You',
        content: inst.about_user,
        pushed: tracking.get('about-user')?.status === 'done',
        raw: { id: 'about-user', section: 'About You', content: inst.about_user },
      })
    }
    if (inst.about_model) {
      rows.push({
        id: 'about-model',
        section: 'Response Style',
        content: inst.about_model,
        pushed: tracking.get('about-model')?.status === 'done',
        raw: { id: 'about-model', section: 'Response Style', content: inst.about_model },
      })
    }
    return rows
  }, [instructions, tracking])

  const rowSelection: RowSelectionState = useMemo(() => {
    const sel: RowSelectionState = {}
    for (const row of instructionRows) {
      if (tracking.get(row.id)?.is_selected) sel[row.id] = true
    }
    return sel
  }, [instructionRows, tracking])

  const handleRowSelectionChange = useCallback((updated: RowSelectionState) => {
    for (const row of instructionRows) {
      const wasSelected = Boolean(rowSelection[row.id])
      const isNowSelected = Boolean(updated[row.id])
      if (wasSelected !== isNowSelected) {
        toggleSelection(row.id, isNowSelected)
      }
    }
  }, [instructionRows, rowSelection, toggleSelection])



  return (
    <div>
      <ErrorAlertDialog message={error} onClose={clearError} />

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Custom Instructions</h2>
          <p className="text-sm text-muted-foreground">{instructionRows.length} instructions downloaded from ChatGPT</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton refreshing={refreshing} onClick={handleRefreshPushed} />
        </div>
      </div>

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
          rowSelection={rowSelection}
          onRowSelectionChange={handleRowSelectionChange}
          onRowClick={setPreview}
          footer={<SelectionSummary />}
        />
      )}

      <PreviewModal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.section || ''}
        sentContent={preview ? markdownToText(preview.content) : undefined}
        originalContent={preview?.content}
        rawData={preview?.raw}
        pushContent={preview && !preview.pushed ? preview.content : undefined}
        pushTitle={preview?.section}
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
