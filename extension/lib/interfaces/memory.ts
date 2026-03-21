/**
 * Pluggable memory interface.
 */
import type { ChatGPTRawMemory } from './chatgpt-api-types';

export interface IMemory {
  readonly data: ChatGPTRawMemory;
  readonly id: string;
  readonly content: string;
  readonly created_at: string | null;
}
