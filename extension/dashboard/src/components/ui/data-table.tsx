import { useState } from 'react'
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type RowSelectionState,
  type Row,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  /** Externally-controlled row selection keyed by row id */
  rowSelection?: RowSelectionState
  onRowSelectionChange?: (updated: RowSelectionState) => void
  /** Return a stable id per row for selection tracking */
  getRowId?: (row: TData) => string
  /** Control which rows are selectable */
  enableRowSelection?: boolean | ((row: Row<TData>) => boolean)
  /** Rendered below the table inside the card */
  footer?: React.ReactNode
  /** Called when a row is clicked (excludes checkbox cell clicks) */
  onRowClick?: (row: TData) => void
  /** Optional className for the outer wrapper */
  className?: string
  /** Default sort state */
  initialSorting?: SortingState
}

export function DataTable<TData, TValue>({
  columns,
  data,
  rowSelection: externalRowSelection,
  onRowSelectionChange: externalOnRowSelectionChange,
  getRowId,
  enableRowSelection,
  footer,
  onRowClick,
  className,
  initialSorting,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting ?? [])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [internalRowSelection, setInternalRowSelection] = useState<RowSelectionState>({})

  const rowSelection = externalRowSelection ?? internalRowSelection
  const onRowSelectionChange = externalOnRowSelectionChange ?? setInternalRowSelection

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater
      onRowSelectionChange(next)
    },
    getRowId,
    enableRowSelection,
    state: {
      sorting,
      columnFilters,
      rowSelection,
    },
  })

  return (
    <div className={className}>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
            {/* Filter row */}
            {table.getHeaderGroups().map((headerGroup) => {
              const hasFilters = headerGroup.headers.some((h) => h.column.getCanFilter())
              if (!hasFilters) return null
              return (
                <TableRow key={`${headerGroup.id}-filter`} className="bg-muted/30">
              {headerGroup.headers.map((header) => {
                    const meta = header.column.columnDef.meta as
                      | { filterComponent?: (props: { column: typeof header.column; table: typeof table }) => React.ReactNode }
                      | undefined
                    return (
                      <TableHead key={`${header.id}-filter`} className="py-1.5 align-top">
                        {header.column.getCanFilter() && meta?.filterComponent
                          ? meta.filterComponent({ column: header.column, table })
                          : null}
                      </TableHead>
                    )
                  })}
                </TableRow>
              )
            })}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className={onRowClick ? 'cursor-pointer' : ''}
                  onClick={(e) => {
                    // Skip if clicking a checkbox or interactive element
                    const target = e.target as HTMLElement
                    if (target.closest('input[type="checkbox"], button, a')) return
                    onRowClick?.(row.original)
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {footer && (
        <div className="px-4 py-3">
          {footer}
        </div>
      )}
    </div>
  )
}
