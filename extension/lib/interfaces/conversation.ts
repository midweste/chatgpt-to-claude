/**
 * Pluggable conversation interface — any source wrapper must implement this.
 */
import type { ChatGPTRawConversation } from './chatgpt-api-types';

export interface IConversation {
  readonly data: ChatGPTRawConversation;
  readonly id: string;
  readonly title: string;
  readonly created_at: string | null;
  readonly updated_at: string | null;
  readonly model: string | null;
  readonly message_count: number;
  readonly project_id: string | null;
  readonly is_archived: boolean;
}
