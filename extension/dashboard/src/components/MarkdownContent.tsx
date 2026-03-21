/**
 * Markdown renderer for chat message content.
 *
 * Wraps react-markdown with prose styling scoped to message bubbles.
 * Pass `inverted` when rendering inside a dark-background bubble (e.g. user messages)
 * to keep text white.
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownContentProps {
  content: string
  className?: string
  /** Use inverted prose colors (white text) for dark-background containers */
  inverted?: boolean
}

export function MarkdownContent({ content, className = '', inverted = false }: MarkdownContentProps) {
  return (
    <div
      className={`prose prose-sm max-w-none
        prose-p:my-1 prose-p:leading-relaxed
        prose-headings:my-2 prose-headings:font-semibold
        prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5
        prose-pre:my-2 prose-pre:rounded-md prose-pre:p-3
        prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:before:content-none prose-code:after:content-none
        prose-blockquote:my-2 prose-blockquote:border-foreground/20
        prose-a:underline
        prose-img:my-2 prose-img:rounded
        prose-table:my-2 prose-th:border prose-th:border-foreground/20 prose-th:px-2 prose-th:py-1 prose-th:text-left
        prose-td:border prose-td:border-foreground/20 prose-td:px-2 prose-td:py-1
        ${inverted
          ? 'text-background prose-headings:text-background prose-p:text-background prose-li:text-background prose-strong:text-background prose-a:text-background prose-code:text-background prose-code:bg-white/20 prose-pre:bg-white/10 prose-pre:text-background prose-blockquote:text-background/80 prose-th:border-white/20 prose-td:border-white/20 prose-th:text-background prose-td:text-background'
          : 'dark:prose-invert prose-a:text-primary prose-code:bg-gray-200 prose-code:text-gray-900 prose-pre:bg-gray-200 prose-pre:text-gray-900 dark:prose-code:bg-white/10 dark:prose-pre:bg-white/10'
        }
        ${className}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
