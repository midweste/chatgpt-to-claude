/**
 * ChatGPT conversation wrapper — typed getters over raw API data.
 */

import type { IConversation } from '../interfaces/conversation';
import type { ChatGPTRawConversation } from '../interfaces/chatgpt-api-types';
import { safeTimestamp } from '../utils/timestamp';

export class ChatGPTConversation implements IConversation {
  readonly data: ChatGPTRawConversation;
  constructor(data: ChatGPTRawConversation) {
    this.data = data;
  }

  get id(): string {
    return (this.data.id ?? this.data.conversation_id ?? '') as string;
  }

  get title(): string {
    return (this.data.title as string) || (this.id ? `Untitled (${this.id.slice(0, 8)})` : 'Untitled');
  }

  get created_at(): string | null {
    const top = safeTimestamp(this.data.create_time ?? this.data.created_at);
    if (top) return top;
    // Fallback: earliest create_time from mapping message nodes
    const mapping = this.data.mapping as Record<string, Record<string, unknown>> | undefined;
    if (!mapping) return null;
    let earliest = Infinity;
    for (const node of Object.values(mapping)) {
      const msg = node.message as Record<string, unknown> | undefined;
      const ct = msg?.create_time;
      if (typeof ct === 'number' && ct > 0 && ct < earliest) earliest = ct;
    }
    return earliest < Infinity ? safeTimestamp(earliest) : null;
  }

  get updated_at(): string | null {
    return safeTimestamp(this.data.update_time ?? this.data.updated_at);
  }

  get model(): string | null {
    return (this.data.default_model_slug as string) || null;
  }

  get message_count(): number {
    const mapping = this.data.mapping as Record<string, Record<string, unknown>> | undefined;
    if (!mapping) return 0;

    // Count only nodes along the active path (last child at each branch)
    let count = 0;
    let current_id: string | null = null;
    for (const [id, node] of Object.entries(mapping)) {
      if (!(node as Record<string, unknown>).parent) {
        current_id = id;
        break;
      }
    }

    const visited = new Set<string>();
    while (current_id && !visited.has(current_id)) {
      visited.add(current_id);
      const node = mapping[current_id] as Record<string, unknown> | undefined;
      if (!node) break;

      const message = node.message as Record<string, unknown> | undefined;
      if (message) {
        const role = (message.author as Record<string, string>)?.role;
        const content = message.content as Record<string, unknown> | undefined;
        const content_type = content?.content_type;
        const parts = content?.parts as unknown[] | undefined;
        const has_text = content_type === 'text' && parts?.some((p) => typeof p === 'string' && p.trim());
        if ((role === 'user' || role === 'assistant') && has_text) count++;
      }

      const children = node.children as string[] | undefined;
      current_id = children?.length ? children[children.length - 1] : null;
    }
    return count;
  }

  get project_id(): string | null {
    return (this.data.gizmo_id ?? this.data.project_id ?? null) as string | null;
  }

  get is_archived(): boolean {
    return (this.data.is_archived as boolean) || false;
  }
}
