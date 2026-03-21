/**
 * Selection summary — shows combined selection counts across
 * conversations, memories, and instructions, including pushed count.
 */

import { useConversationStore, selectSelectedCount, selectSelectedMemoryCount, selectSelectedInstructionCount } from '@/stores/conversation-store'

export function SelectionSummary() {
  const tracking = useConversationStore((s) => s.tracking)
  const conv_count = useConversationStore(selectSelectedCount)
  const mem_count = useConversationStore(selectSelectedMemoryCount)
  const instr_count = useConversationStore(selectSelectedInstructionCount)

  // Pushed count via tracking
  let pushed_count = 0
  tracking.forEach((t) => {
    if (t.type === 'conversation' && t.status === 'done') pushed_count++
  })

  const parts: string[] = []
  if (conv_count > 0 || pushed_count > 0) {
    let label = `${conv_count} conversation${conv_count !== 1 ? 's' : ''}`
    if (pushed_count > 0) label += ` (${pushed_count} pushed)`
    parts.push(label)
  }
  if (mem_count > 0) parts.push(`${mem_count} memor${mem_count !== 1 ? 'ies' : 'y'}`)
  if (instr_count > 0) parts.push(`${instr_count} instruction${instr_count !== 1 ? 's' : ''}`)

  if (parts.length === 0) return <span className="text-sm text-muted-foreground">Nothing selected for migration</span>

  return (
    <span className="text-sm text-muted-foreground">
      {parts.join(', ')} selected for migration
    </span>
  )
}
