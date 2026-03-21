/**
 * ConversationPreviewContent — renders message bubbles for conversation preview.
 *
 * Extracted from BrowsePage and ConversationsPage to eliminate duplication.
 * Takes a raw conversation mapping and renders ordered messages with
 * role labels, timestamps, and markdown content.
 */

import { extractOrderedMessages, type OrderedMessage } from '@lib/transform/gpt-to-claude'
import { MarkdownContent } from '@/components/MarkdownContent'

interface ConversationPreviewContentProps {
  mapping: Record<string, Record<string, unknown>> | undefined
}

export function ConversationPreviewContent({ mapping }: ConversationPreviewContentProps) {
  const messages: OrderedMessage[] = mapping
    ? extractOrderedMessages(mapping)
    : []

  return (
    <div className="space-y-4">
      {messages.map((msg, i) => {
        const is_user = msg.role === 'User'
        const time_str = msg.timestamp
          ? new Date(msg.timestamp * 1000).toLocaleString()
          : ''
        return (
          <div key={i} className={`flex flex-col ${is_user ? 'items-end' : 'items-start'}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-medium text-foreground/40">
                {msg.role}
              </span>
              {time_str && (
                <span className="text-[10px] text-foreground/30">
                  {time_str}
                </span>
              )}
            </div>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                is_user
                  ? 'bg-foreground text-background rounded-br-sm'
                  : 'bg-card border border-border/40 text-foreground rounded-bl-sm'
              }`}
            >
              <MarkdownContent content={msg.content} inverted={is_user} />
            </div>
          </div>
        )
      })}
      {messages.length === 0 && (
        <p className="text-sm text-foreground/50 italic">No messages found in conversation data.</p>
      )}
    </div>
  )
}
