/**
 * Preview modal — shared content preview overlay with optional side-by-side.
 *
 * When `sentContent` is provided, shows a split view:
 *   Left:  original content (children) — rendered markdown
 *   Right: what will be sent — plain text with copy button
 *
 * When `sentContent` is omitted, shows a single full-width panel.
 *
 * When `pushContent` + `pushTitle` are provided, shows a PushButton in the footer.
 */

import { useState } from 'react'
import { X, Code, FileText, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PushButton } from '@/components/PushButton'

interface PreviewModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  /** Plain text of what will be sent — enables the split view with copy button */
  sentContent?: string
  /** Original markdown content — enables copy on the formatted view */
  originalContent?: string
  /** Raw data object — when provided, a code button toggles between formatted view and raw JSON */
  rawData?: unknown
  /** Content to push to Claude — when provided with pushTitle, renders PushButton in footer */
  pushContent?: string
  /** Title for the Claude conversation when pushing */
  pushTitle?: string
  /** Claude project to place the conversation into (falls back to default_project setting) */
  pushProjectName?: string
  /** Called after successful push */
  onPushed?: (claude_uuid: string) => void
}

export function PreviewModal({ open, onClose, title, subtitle, children, sentContent, originalContent, rawData, pushContent, pushTitle, pushProjectName, onPushed }: PreviewModalProps) {
  const [show_raw, setShowRaw] = useState(false)

  if (!open) return null

  const has_push = pushContent !== undefined && pushTitle !== undefined

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="relative mx-4 flex h-[85vh] w-[80vw] flex-col overflow-hidden rounded-lg border bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h3 className="text-base font-semibold">{title}</h3>
            {subtitle && <p className="text-xs text-foreground/50">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        {sentContent !== undefined ? (
          <div className="flex flex-1 overflow-hidden">
            {/* Left: Original */}
            <div className="flex w-1/2 flex-col border-r">
              <div className="flex items-center justify-between border-b bg-accent/30 px-4 py-2">
                <span className="text-xs font-medium uppercase tracking-wider text-foreground/60">Original</span>
                <div className="flex items-center gap-1">
                  {(show_raw ? rawData !== undefined : originalContent !== undefined) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-2 text-xs"
                      onClick={() => {
                        const text = show_raw
                          ? JSON.stringify(rawData, null, 2)
                          : originalContent!
                        navigator.clipboard.writeText(text)
                        toast.success('Copied to clipboard')
                      }}
                    >
                      <Copy className="h-3 w-3" />
                      Copy
                    </Button>
                  )}
                  {rawData !== undefined && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-2 text-xs"
                      onClick={() => setShowRaw(!show_raw)}
                    >
                      {show_raw ? <FileText className="h-3 w-3" /> : <Code className="h-3 w-3" />}
                      {show_raw ? 'Formatted' : 'JSON'}
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {show_raw && rawData !== undefined ? (
                  <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/80">
                    {JSON.stringify(rawData, null, 2)}
                  </pre>
                ) : (
                  children
                )}
              </div>
            </div>
            {/* Right: What Will Be Sent */}
            <div className="flex w-1/2 flex-col">
              <div className="flex items-center justify-between border-b bg-accent/30 px-4 py-2">
                <span className="text-xs font-medium uppercase tracking-wider text-foreground/60">What Will Be Sent</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(sentContent)
                    toast.success('Copied to clipboard')
                  }}
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </Button>
              </div>
              <div className="flex-1 overflow-auto bg-card p-4">
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/80">
                  {sentContent}
                </pre>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-6">
            {children}
          </div>
        )}

        {/* Footer — PushButton when push props provided */}
        {has_push && (
          <div className="border-t px-6 py-3 flex items-center justify-end gap-2">
            <PushButton content={pushContent!} title={pushTitle!} projectName={pushProjectName} onPushed={onPushed} />
          </div>
        )}
      </div>
    </div>
  )
}
