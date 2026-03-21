/**
 * ChatGPT memory wrapper — typed getters over raw API data.
 */

import type { IMemory } from '../interfaces/memory';
import type { ChatGPTRawMemory } from '../interfaces/chatgpt-api-types';
import { safeTimestamp } from '../utils/timestamp';

export class ChatGPTMemory implements IMemory {
  readonly data: ChatGPTRawMemory;
  constructor(data: ChatGPTRawMemory) {
    this.data = data;
  }

  get id(): string {
    return this.data.id as string;
  }

  get content(): string {
    return (
      this.data.content ??
      this.data.value ??
      this.data.text ??
      this.data.memory ??
      ''
    ) as string;
  }

  get created_at(): string | null {
    return safeTimestamp(
      this.data.created_timestamp ?? this.data.created_at ?? this.data.create_time
      ?? this.data.updated_at ?? this.data.update_time ?? this.data.updated_timestamp,
    );
  }

  get updated_at(): string | null {
    return safeTimestamp(
      this.data.updated_at ?? this.data.update_time ?? this.data.updated_timestamp,
    );
  }
}
