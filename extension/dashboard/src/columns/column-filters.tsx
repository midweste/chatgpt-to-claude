/**
 * Shared column filter components and helper functions
 * for DataTable columns across all entity types.
 */

import React from 'react'
import type { Column } from '@tanstack/react-table'
import { ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ── Filter components ────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic filter, works with any row type
export function TextFilter({ column }: { column: Column<any> }) {
  return (
    <Input
      value={(column.getFilterValue() as string) ?? ''}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      placeholder="Search..."
      className="h-8 min-w-[80px] text-xs"
    />
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic filter, works with any row type
export function SelectFilter({ column, options, labels }: { column: Column<any>; options: string[]; labels?: Record<string, string> }) {
  return (
    <Select
      value={(column.getFilterValue() as string) ?? '__all__'}
      onValueChange={(val) => column.setFilterValue(val === '__all__' ? undefined : val)}
    >
      <SelectTrigger size="sm" className="h-8 w-full text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">All</SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>{labels?.[opt] ?? opt}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic filter, works with any row type
export function BooleanFilter({ column }: { column: Column<any> }) {
  return (
    <Select
      value={
        column.getFilterValue() === true ? 'true'
          : column.getFilterValue() === false ? 'false'
          : '__all__'
      }
      onValueChange={(val) => {
        if (val === '__all__') column.setFilterValue(undefined)
        else column.setFilterValue(val === 'true')
      }}
    >
      <SelectTrigger size="sm" className="h-8 w-full text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">All</SelectItem>
        <SelectItem value="true">Yes</SelectItem>
        <SelectItem value="false">No</SelectItem>
      </SelectContent>
    </Select>
  )
}

/** Compact tri-state toggle: all → yes → no → all. Minimal width. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic filter, works with any row type
export function ToggleFilter({ column, labels = ['All', '✓', '✗'] }: { column: Column<any>; labels?: [string, string, string] }) {
  const val = column.getFilterValue()
  const state = val === true ? 1 : val === false ? 2 : 0

  return (
    <button
      type="button"
      onClick={() => {
        const next = (state + 1) % 3
        column.setFilterValue(next === 0 ? undefined : next === 1)
      }}
      className={`inline-flex h-7 items-center justify-center rounded-md border px-2 text-[11px] font-medium transition-colors ${
        state === 0
          ? 'border-border/50 text-muted-foreground/50'
          : state === 1
            ? 'border-green-500/50 bg-green-500/10 text-green-600'
            : 'border-red-500/50 bg-red-500/10 text-red-600'
      }`}
    >
      {labels[state]}
    </button>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic filter, works with any row type
export function NumberRangeFilter({ column, align }: { column: Column<any>; align?: 'right' }) {
  const val = column.getFilterValue() as [string, number] | undefined
  const op = val?.[0] ?? '>'
  const num = val?.[1] ?? ''

  return (
    <div className="flex items-center gap-1 whitespace-nowrap min-w-[140px]">
      <Select
        value={op}
        onValueChange={(v) => {
          if (num !== '') column.setFilterValue([v, num])
        }}
      >
        <SelectTrigger size="sm" className="h-8 w-[70px] shrink-0 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="<">&lt;</SelectItem>
          <SelectItem value="<=">&le;</SelectItem>
          <SelectItem value="=">=</SelectItem>
          <SelectItem value=">=">&ge;</SelectItem>
          <SelectItem value=">">&gt;</SelectItem>
        </SelectContent>
      </Select>
      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={num}
        onChange={(e) => {
          const n = e.target.value.replace(/[^0-9]/g, '')
          if (n === '') column.setFilterValue(undefined)
          else column.setFilterValue([op, Number(n)])
        }}
        placeholder="—"
        className={`h-8 min-w-[60px] text-xs tabular-nums ${align === 'right' ? 'text-right' : ''}`}
      />
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic filter, works with any row type
export function DateRangeFilter({ column }: { column: Column<any> }) {
  const val = column.getFilterValue() as [string, string] | undefined
  const op = val?.[0] ?? '>'
  const dateStr = val?.[1] ?? ''

  return (
    <div className="flex items-center gap-1 whitespace-nowrap min-w-[160px]">
      <Select
        value={op}
        onValueChange={(v) => {
          if (dateStr) column.setFilterValue([v, dateStr])
        }}
      >
        <SelectTrigger size="sm" className="h-8 w-[70px] shrink-0 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="<">&lt;</SelectItem>
          <SelectItem value="<=">&le;</SelectItem>
          <SelectItem value=">=">&ge;</SelectItem>
          <SelectItem value=">">&gt;</SelectItem>
        </SelectContent>
      </Select>
      <Input
        type="date"
        value={dateStr}
        onChange={(e) => {
          if (e.target.value) column.setFilterValue([op, e.target.value])
          else column.setFilterValue(undefined)
        }}
        className="h-8 min-w-[100px] text-xs"
      />
    </div>
  )
}

// ── Filter functions ─────────────────────────────────────────────

export function numberRangeFilterFn(row: { getValue: (id: string) => unknown }, columnId: string, filterValue: [string, number]) {
  const val = Number(row.getValue(columnId)) || 0
  const [op, target] = filterValue
  if (op === '<') return val < target
  if (op === '<=') return val <= target
  if (op === '>=') return val >= target
  if (op === '>') return val > target
  return val === target
}

export function dateRangeFilterFn(row: { getValue: (id: string) => unknown }, columnId: string, filterValue: [string, string]) {
  const val = row.getValue(columnId) as string
  if (!val) return false
  const [op, target] = filterValue
  const rowDate = val.slice(0, 10)
  if (op === '<') return rowDate < target
  if (op === '<=') return rowDate <= target
  if (op === '>=') return rowDate >= target
  return rowDate > target
}

export function booleanFilterFn(row: { getValue: (id: string) => unknown }, columnId: string, filterValue: boolean) {
  return Boolean(row.getValue(columnId)) === filterValue
}

// ── Sortable header ──────────────────────────────────────────────

export function SortableHeader<T>({ column, children, className }: { column: Column<T>; children: React.ReactNode; className?: string }) {
  return (
    <Button
      variant="ghost"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      className={`-ml-3 h-8 gap-1 ${className ?? ''}`}
    >
      {children}
      <ArrowUpDown className="h-3.5 w-3.5" />
    </Button>
  )
}
