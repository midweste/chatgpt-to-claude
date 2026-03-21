/**
 * Mustache-based transcript renderer.
 *
 * Renders a conversation into a human-readable transcript using
 * the conversation.mustache template.
 */

import Mustache from 'mustache';
import conversationTemplate from './templates/conversation.mustache?raw';

export interface TranscriptView {
  title: string;
  meta: string;
  created_at: string;
  model: string;
  message_count: number;
  prefix: string;
  suffix: string;
  messages: Array<{
    is_user: boolean;
    date: string;
    content: string;
    quoted_content: string;
  }>;
}

export function renderTranscript(view: TranscriptView): string {
  return Mustache.render(conversationTemplate, view).trimEnd();
}
