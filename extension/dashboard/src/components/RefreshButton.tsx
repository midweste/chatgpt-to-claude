/**
 * RefreshButton — "Refresh from Claude" button with loading state.
 *
 * Used across conversation, memory, and instruction pages.
 */

import { RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RefreshButtonProps {
  refreshing: boolean
  onClick: () => void
  label?: string
}

export function RefreshButton({ refreshing, onClick, label = 'Refresh Claude Conversations' }: RefreshButtonProps) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={refreshing}>
      {refreshing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
      {label}
    </Button>
  )
}
