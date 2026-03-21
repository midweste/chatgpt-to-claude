/**
 * GPT → Claude formatting utilities.
 *
 * Shared transcript formatting and message extraction used by
 * entity classes (ClaudeConversation, etc.) and the export service.
 */

import type { IConversation } from '../interfaces/conversation';

import { renderTranscript } from './transcript-renderer';


// ── Transcript Renderer ──────────────────────────────────────

export function formatTranscript(
  conv: IConversation,
  prefix = '',
  suffix = '',
  content_transform?: (text: string) => string,
): string {
  const meta_parts: string[] = [];
  if (conv.created_at) meta_parts.push(conv.created_at);
  if (conv.model) meta_parts.push(conv.model);
  if (conv.message_count) meta_parts.push(`${conv.message_count} messages`);

  const mapping = conv.data.mapping as Record<string, Record<string, unknown>> | undefined;
  const ordered = mapping ? extractOrderedMessages(mapping) : [];

  return renderTranscript({
    title: conv.title,
    meta: meta_parts.join(' · '),
    created_at: conv.created_at || '',
    model: conv.model || '',
    message_count: conv.message_count || 0,
    prefix,
    suffix,
    messages: ordered.map((msg) => {
      const text = content_transform ? content_transform(msg.content) : msg.content;
      return {
        is_user: msg.role === 'User',
        date: msg.timestamp
          ? (() => {
              const d = new Date(msg.timestamp! * 1000);
              return d.toISOString().slice(0, 10) + ' ' +
                d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
            })()
          : '',
        content: text,
        quoted_content: text.split('\n').map((line) => `> ${line}`).join('\n'),
      };
    }),
  });
}

// ── Message Extraction ───────────────────────────────────────

export interface OrderedMessage {
  role: string;
  content: string;
  timestamp?: number;
}

export function extractOrderedMessages(
  mapping: Record<string, Record<string, unknown>>,
): OrderedMessage[] {
  const messages: OrderedMessage[] = [];

  let current_id: string | null = null;
  for (const [id, node] of Object.entries(mapping)) {
    if (!node.parent) {
      current_id = id;
      break;
    }
  }

  const visited = new Set<string>();
  while (current_id && !visited.has(current_id)) {
    visited.add(current_id);
    const node = mapping[current_id];
    if (!node) break;

    const message = node.message as Record<string, unknown> | undefined;
    if (message) {
      const role = (message.author as Record<string, string>)?.role;
      const content = extract_content(message);
      const timestamp = message.create_time as number | undefined;
      if (role && content && (role === 'user' || role === 'assistant')) {
        messages.push({
          role: role === 'user' ? 'User' : 'Assistant',
          content,
          timestamp: timestamp || undefined,
        });
      }
    }

    const children = node.children as string[] | undefined;
    current_id = children?.length ? children[children.length - 1] : null;
  }

  return messages;
}

function extract_content(message: Record<string, unknown>): string {
  const content = message.content as Record<string, unknown> | undefined;
  if (!content) return '';

  const parts = content.parts as unknown[] | undefined;
  if (!parts) return '';

  const raw = parts
    .filter((p): p is string => typeof p === 'string')
    .join('\n')
    .trim();

  // Get content_references from metadata for citation resolution
  const metadata = message.metadata as Record<string, unknown> | undefined;
  const refs = (metadata?.content_references ?? []) as ContentReference[];

  return sanitize_content(raw, refs);
}


interface ContentReference {
  type?: string;
  domain?: string;
  entries?: Array<{
    type?: string;
    url?: string;
    title?: string;
    ref_id?: { turn_index?: number; ref_type?: string; ref_index?: number };
  }>;
  start_ix?: number;
  end_ix?: number;
  metadata?: { type?: string; title?: string; url?: string };
}

/**
 * Convert ChatGPT internal citation/link markers to readable text.
 *
 * Root cause: ChatGPT uses Private Use Area (PUA) Unicode characters
 * to encode inline citations and link previews in message text:
 *   - U+E200: citation block start
 *   - U+E201: citation block end
 *   - U+E202: delimiter between citation identifiers
 *   - U+FFFC: object replacement char, wraps link_title blocks
 *
 * These have no font glyph → render as squares (▯).
 * We resolve them against metadata.content_references to produce
 * readable references like [Title](url).
 */
function sanitize_content(text: string, refs: ContentReference[]): string {
  // Build a lookup: "turn{X}search{Y}" → { title, url }
  const ref_map = new Map<string, { title: string; url: string }>();
  for (const cr of refs) {
    if (cr.type === 'search_result_group' && cr.entries) {
      for (const entry of cr.entries) {
        if (entry.ref_id && entry.title && entry.url) {
          const key = `turn${entry.ref_id.turn_index}search${entry.ref_id.ref_index}`;
          ref_map.set(key, { title: entry.title, url: entry.url });
        }
      }
    }
  }

  return text
    // ChatGPT canvas/writing blocks: :::writing{id="..." variant="email" subject="..."}
    // Strip the wrapper, keep content, extract subject as a label
    .replace(/:::writing\{[^}]*?subject="([^"]*)"[^}]*}\n?/g, '[$1]\n')
    .replace(/:::writing\{[^}]*\}\n?/g, '')
    .replace(/\n?:::\s*$/gm, '')

    // Citation blocks: \uE200cite<refs>\uE201 → resolved title/link
    .replace(/\uE200cite([^\uE201]*)\uE201/g, (_match, inner: string) => {
      // inner looks like "turn0search0\uE202turn0search1"
      const ids = inner.split('\uE202').filter(Boolean);
      const resolved = ids
        .map((id: string) => {
          const info = ref_map.get(id.trim());
          return info ? `[${info.title}](${info.url})` : null;
        })
        .filter(Boolean);
      return resolved.length > 0 ? resolved.join(' ') : '';
    })

    // Link title blocks: \uFFFClink_title<TITLE>turn0view0\uFFFC → [TITLE]
    .replace(/\uFFFClink_title(.*?)turn\d+view\d+\uFFFC/g, '[$1]')

    // Any remaining PUA delimiters or FFFC with no recognized pattern
    .replace(/[\uE200\uE201\uE202\uFFFC]/g, '')

    // Clean up any resulting double spaces
    .replace(/ {2,}/g, ' ')
    .trim();
}
