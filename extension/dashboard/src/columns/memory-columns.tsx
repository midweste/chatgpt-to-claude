/**
 * Column definitions for the memories data table.
 */

import type { ColumnDef, Column } from '@tanstack/react-table'
import { Check } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  TextFilter,
  DateRangeFilter,
  SortableHeader,
  dateRangeFilterFn,
} from './column-filters'

export type MemoryRow = {
  id: string
  content: string
  created_at: string | null
  pushed?: boolean
  raw: Record<string, unknown>
}

export const memoryColumns: ColumnDef<MemoryRow>[] = [
  {
    id: 'select',
    size: 40,
    enableSorting: false,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
        onCheckedChange={(val) => table.toggleAllPageRowsSelected(!!val)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(val) => row.toggleSelected(!!val)}
      />
    ),
  },
  {
    id: 'pushed',
    size: 28,
    enableSorting: false,
    enableHiding: false,
    header: () => null,
    cell: ({ row }) => row.original.pushed
      ? <Check className="h-3.5 w-3.5 text-green-500" />
      : null,
  },
  {
    accessorKey: 'content',
    header: ({ column }) => <SortableHeader column={column}>Memory</SortableHeader>,
    cell: ({ getValue }) => <span className="text-sm max-w-md truncate block">{getValue() as string}</span>,
    meta: {
      filterComponent: ({ column }: { column: Column<MemoryRow> }) => <TextFilter column={column} />,
    },
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => <SortableHeader column={column}>Date</SortableHeader>,
    size: 120,
    cell: ({ getValue }) => {
      const val = getValue() as string | null
      return <span className="whitespace-nowrap text-sm text-muted-foreground">{val ? new Date(val).toLocaleDateString() : '—'}</span>
    },
    filterFn: dateRangeFilterFn,
    meta: {
      filterComponent: ({ column }: { column: Column<MemoryRow> }) => <DateRangeFilter column={column} />,
    },
  },
]
