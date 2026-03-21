/**
 * Claude memory entity.
 *
 * Wraps IMemory[] and owns its preparation and push to Claude.
 *
 * @future Not yet wired into the migration pipeline. Pre-built for
 * memory push functionality — will be consumed by migration-store
 * once memory push is enabled in the UI.
 */

import type { IMemory } from '../interfaces/memory';
import type { ClaudeDestination } from './claude';
import { logger } from '../services/logger';
import { CLAUDE_DEFAULT_MODEL } from '../constants/claude';

export class ClaudeMemory {
  private sources: IMemory[];
  private claude: ClaudeDestination;
  private _content: string;

  constructor(
    sources: IMemory[],
    claude: ClaudeDestination,
  ) {
    this.sources = sources;
    this.claude = claude;
    this._content = ClaudeMemory.format(sources);
  }

  get title(): string { return `${this.sources.length} memories`; }
  get content(): string { return this._content; }

  /**
   * Format memories into a dated list suitable for Claude.
   */
  static format(mems: IMemory[]): string {
    const lines = mems.map((m) => {
      const date = m.created_at
        ? new Date(m.created_at).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
          })
        : 'Unknown date';
      return `[${date}] - ${m.content}`;
    });
    return lines.join('\n');
  }

  /**
   * Push memories to Claude as a conversation containing all memory entries.
   * Returns the Claude conversation UUID.
   */
  async push(options?: {
    model?: string;
    prompt_prefix?: string;
    name_prefix?: string;
  }): Promise<string> {
    const model = options?.model ?? CLAUDE_DEFAULT_MODEL;
    const prompt_prefix = options?.prompt_prefix ?? '';
    const title = 'ChatGPT Memories';

    const message = prompt_prefix
      ? `${prompt_prefix}\n\n${this._content}`
      : this._content;

    const created = await this.claude.createConversation();
    await this.claude.sendMessage(created.uuid, message, undefined, model);
    await this.claude.renameConversation(created.uuid, title);

    await logger.info('migrate', `✓ Pushed ${this.sources.length} memories → Claude (${created.uuid})`);
    return created.uuid;
  }
}
