/**
 * ErrorAlertDialog — reusable error dialog for page-level errors.
 *
 * Used across conversation, memory, and instruction pages.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog'

interface ErrorAlertDialogProps {
  message: string
  onClose: () => void
}

export function ErrorAlertDialog({ message, onClose }: ErrorAlertDialogProps) {
  return (
    <AlertDialog open={!!message} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Error</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>OK</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
