/**
 * Claude conversation entity.
 *
 * Wraps an IConversation and owns its preparation and push to Claude.
 * Implements IPushableEntity so destinations own their own message preparation.
 *
 * Content preparation is delegated to prepareConversationMessage (single source of truth).
 */

import type { IConversation } from '../interfaces/conversation';
import type { IPushableEntity, PushOptions } from '../interfaces/pushable';
import type { ClaudeDestination } from './claude';
import { logger } from '../services/logger';
import { prepareConversationMessage } from '../transform/prepare-push-message';
import { CLAUDE_DEFAULT_MODEL } from '../constants/claude';

export class ClaudeConversation implements IPushableEntity {
  private source: IConversation;
  private claude: ClaudeDestination;
  private _title: string;

  constructor(
    source: IConversation,
    claude: ClaudeDestination,
  ) {
    this.source = source;
    this.claude = claude;
    this._title = source.title;
  }

  get id(): string { return this.source.id; }
  get title(): string { return this._title; }

  /**
   * Prepare the final message for Claude.
   * Single source of truth — push() calls this internally.
   */
  prepareMessage(options?: PushOptions): string {
    return prepareConversationMessage(this.source, {
      push_format: options?.push_format ?? 'text',
      prompt_prefix: options?.prompt_prefix ?? '',
      prompt_suffix: options?.prompt_suffix ?? '',
    });
  }

  /**
   * Push this conversation to Claude.
   * Creates a new Claude conversation, sends the prepared message, and renames it.
   * Returns the Claude conversation UUID.
   */
  async push(options?: PushOptions): Promise<string> {
    const model = options?.model ?? CLAUDE_DEFAULT_MODEL;
    const name_prefix = options?.name_prefix ?? '';

    const message = this.prepareMessage(options);

    const created = await this.claude.createConversation();
    await this.claude.sendMessage(created.uuid, message, undefined, model);

    const display_name = name_prefix
      ? `${name_prefix}${this._title}`
      : this._title;
    await this.claude.renameConversation(created.uuid, display_name);

    await logger.info('migrate', `✓ Pushed "${this._title}" → Claude (${created.uuid})`);
    return created.uuid;
  }
}
