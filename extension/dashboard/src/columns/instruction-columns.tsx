/**
 * Column definitions for the instructions data table.
 */

import type { ColumnDef, Column } from '@tanstack/react-table'
import { Check } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  TextFilter,
  SelectFilter,
  SortableHeader,
} from './column-filters'

export type InstructionRow = {
  id: string
  section: string
  content: string
  pushed?: boolean
  raw: Record<string, unknown>
}

export const instructionColumns: ColumnDef<InstructionRow>[] = [
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
    accessorKey: 'section',
    header: ({ column }) => <SortableHeader column={column}>Section</SortableHeader>,
    size: 180,
    cell: ({ getValue }) => <span className="text-sm font-medium">{getValue() as string}</span>,
    meta: {
      filterComponent: ({ column }: { column: Column<InstructionRow> }) => (
        <SelectFilter column={column} options={['About You', 'Response Style']} />
      ),
    },
  },
  {
    accessorKey: 'content',
    header: ({ column }) => <SortableHeader column={column}>Content</SortableHeader>,
    cell: ({ getValue }) => <span className="text-sm line-clamp-2">{getValue() as string}</span>,
    meta: {
      filterComponent: ({ column }: { column: Column<InstructionRow> }) => <TextFilter column={column} />,
    },
  },
]
