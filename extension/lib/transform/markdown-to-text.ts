/**
 * Content transform pipeline — single source of truth.
 *
 * markdownToText: markdown → HTML (via marked) → readable plain text (via html-to-text).
 * prepareContent:  IConversation → transcript → plain text. Used by both preview and push.
 */

import { marked } from 'marked';
import { convert } from 'html-to-text';
import type { IConversation } from '../interfaces/conversation';
import { formatTranscript } from './gpt-to-claude';

const HTML_TO_TEXT_OPTIONS = {
  wordwrap: false as const,
  selectors: [
    { selector: 'a', options: { ignoreHref: true } },
    { selector: 'img', format: 'skip' },
  ],
};

export function markdownToText(md: string): string {
  const html = marked.parse(md, { async: false }) as string;
  return convert(html, HTML_TO_TEXT_OPTIONS).trim();
}

/**
 * Convert a conversation to its final plain text form.
 * This is the ONE function both the preview right panel and the push pipeline use.
 */
export function prepareContent(conv: IConversation): string {
  return markdownToText(formatTranscript(conv));
}
