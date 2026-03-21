/**
 * Column definitions and row mapping for the conversations data table.
 */

import { ChatGPTConversation } from '@lib/sources/chatgpt-conversation'
import type { TrackingRecord } from '@lib/storage/types'

import type { ColumnDef, Column } from '@tanstack/react-table'
import { Check, FolderOpen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  TextFilter,
  SelectFilter,
  NumberRangeFilter,
  DateRangeFilter,
  SortableHeader,
  numberRangeFilterFn,
  dateRangeFilterFn,
} from './column-filters'

export type ConversationRow = {
  id: string
  title: string
  created_at: string | null
  updated_at: string | null
  model: string | null
  message_count: number
  status: string
  is_selected: boolean
  project_id: string | null
  raw: Record<string, unknown>
}

export function buildConversationColumns(
  convProjectMap: Map<string, string>,
  projectOptions: string[],
): ColumnDef<ConversationRow>[] {
  return [
    {
      id: 'selected',
      accessorFn: (row) => row.is_selected && row.status !== 'done',
      size: 40,
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(val) => table.toggleAllPageRowsSelected(!!val)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          disabled={row.original.status === 'done'}
          onCheckedChange={(val) => row.toggleSelected(!!val)}
          className={row.original.status === 'done' ? 'opacity-30' : ''}
        />
      ),
      filterFn: (row, columnId, filterValue) => {
        const selected = row.getValue(columnId) as boolean
        if (filterValue === 'sel') return selected
        if (filterValue === 'unsel') return !selected
        return true
      },
      meta: {
        filterComponent: ({ column }: { column: Column<ConversationRow> }) => (
          <SelectFilter column={column} options={['sel', 'unsel']} labels={{ sel: '☑', unsel: '☐' }} />
        ),
      },
    },
    {
      id: 'pushed',
      accessorFn: (row) => row.status === 'done',
      size: 28,
      enableHiding: false,
      header: ({ column }) => <SortableHeader column={column}>Pushed</SortableHeader>,
      cell: ({ row }) => row.original.status === 'done'
        ? <Check className="h-3.5 w-3.5 text-green-500" />
        : null,
      filterFn: (row, columnId, filterValue) => {
        const pushed = row.getValue(columnId) as boolean
        if (filterValue === 'pushed') return pushed
        if (filterValue === 'unpushed') return !pushed
        return true
      },
      meta: {
        filterComponent: ({ column }: { column: Column<ConversationRow> }) => (
          <SelectFilter column={column} options={['pushed', 'unpushed']} labels={{ pushed: '✓', unpushed: '✗' }} />
        ),
      },
    },
    {
      accessorKey: 'title',
      header: ({ column }) => <SortableHeader column={column}>Title</SortableHeader>,
      cell: ({ getValue }) => (
        <span className="max-w-xs truncate font-medium">
          {getValue() as string}
        </span>
      ),
      meta: {
        filterComponent: ({ column }: { column: Column<ConversationRow> }) => <TextFilter column={column} />,
      },
    },
    {
      id: 'project',
      accessorFn: (row) => convProjectMap.get(row.id) ?? '',
      header: ({ column }) => <SortableHeader column={column}>Project</SortableHeader>,
      cell: ({ getValue }) => {
        const name = getValue() as string
        return name ? (
          <Badge variant="outline" className="gap-1">
            <FolderOpen className="h-3 w-3" />
            {name}
          </Badge>
        ) : <span className="text-muted-foreground">—</span>
      },
      filterFn: (row, columnId, filterValue) => {
        const val = row.getValue(columnId) as string
        if (filterValue === 'In Project') return val !== ''
        if (filterValue === 'No Project') return val === ''
        return val === filterValue
      },
      meta: {
        filterComponent: ({ column }: { column: Column<ConversationRow> }) => (
          <SelectFilter
            column={column}
            options={['In Project', 'No Project', ...projectOptions]}
          />
        ),
      },
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => <SortableHeader column={column}>Date</SortableHeader>,
      cell: ({ getValue }) => {
        const val = getValue() as string
        return <span className="whitespace-nowrap text-sm text-muted-foreground">{val ? new Date(val).toLocaleDateString() : '—'}</span>
      },
      filterFn: dateRangeFilterFn,
      meta: {
        filterComponent: ({ column }: { column: Column<ConversationRow> }) => <DateRangeFilter column={column} />,
      },
    },
    {
      accessorKey: 'message_count',
      header: ({ column }) => <SortableHeader column={column} className="justify-end">Messages</SortableHeader>,
      cell: ({ getValue }) => <span className="block text-right tabular-nums text-sm text-muted-foreground">{(getValue() as number) || '—'}</span>,
      filterFn: numberRangeFilterFn,
      meta: {
        filterComponent: ({ column }: { column: Column<ConversationRow> }) => <NumberRangeFilter column={column} align="right" />,
      },
    },
  ]
}

/** Map raw conversation data + tracking into typed rows for the DataTable. */
export function buildConversationRows(
  conversations: Record<string, unknown>[],
  tracking: Map<string, TrackingRecord>,
): ConversationRow[] {
  return conversations.map((c) => {
    const w = new ChatGPTConversation(c)
    const t = tracking.get(w.id)
    return {
      id: w.id,
      title: w.title,
      created_at: w.created_at,
      updated_at: w.updated_at,
      model: w.model,
      message_count: w.message_count,
      status: t?.status || 'extracted',
      is_selected: t?.is_selected || false,
      project_id: w.project_id,
      raw: c,
    }
  })
}
