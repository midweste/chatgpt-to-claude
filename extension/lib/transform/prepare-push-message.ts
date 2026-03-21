/**
 * Prepare the final message to send to Claude for a conversation.
 *
 * This is the SINGLE SOURCE OF TRUTH for assembling a conversation push message.
 * Used by both the preview UI and the actual push to Claude.
 *
 * Assembles: [prompt_prefix] + [conversation content] + [prompt_suffix]
 * Content format is determined by push_format: 'markdown' preserves formatting,
 * 'text' strips it to plain text.
 */

import type { IConversation } from '../interfaces/conversation';
import { formatTranscript } from './gpt-to-claude';
import { markdownToText } from './markdown-to-text';

export interface PushMessageOptions {
  push_format: 'markdown' | 'text';
  prompt_prefix: string;
  prompt_suffix: string;
}

/**
 * Prepare the final push message for a conversation.
 *
 * @param conv - The conversation to prepare
 * @param options - Format and prefix/suffix settings
 * @returns The fully assembled message string ready for Claude
 */
export function prepareConversationMessage(
  conv: IConversation,
  options: PushMessageOptions,
): string {
  const transform = options.push_format === 'text' ? markdownToText : undefined;
  return formatTranscript(conv, options.prompt_prefix, options.prompt_suffix, transform);
}
