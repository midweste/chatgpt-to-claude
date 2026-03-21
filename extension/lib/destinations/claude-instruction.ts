/**
 * Claude instruction entity.
 *
 * Wraps IInstruction and owns its preparation and push to Claude.
 *
 * @future Not yet wired into the migration pipeline. Pre-built for
 * instruction push functionality — will be consumed by migration-store
 * once instruction push is enabled in the UI.
 */

import type { IInstruction } from '../interfaces/instruction';
import type { ClaudeDestination } from './claude';
import { logger } from '../services/logger';

export class ClaudeInstruction {
  private claude: ClaudeDestination;
  private _content: string;

  constructor(
    source: IInstruction,
    claude: ClaudeDestination,
  ) {
    this.claude = claude;
    this._content = ClaudeInstruction.format(source);
  }

  get title(): string { return 'Custom Instructions'; }
  get content(): string { return this._content; }

  /**
   * Format instructions into a labeled block for Claude.
   */
  static format(inst: IInstruction): string {
    const parts: string[] = [];
    if (inst.about_user) parts.push(`About Me: ${inst.about_user}`);
    if (inst.about_model) parts.push(`Response Style: ${inst.about_model}`);
    return parts.join('\n');
  }

  /**
   * Push instructions to Claude's account-level custom instructions.
   * Appends to existing instructions rather than overwriting.
   * Returns empty string (no conversation UUID for instructions).
   */
  async push(): Promise<string> {
    const existing = await this.claude.getAccountInstructions();

    // Filter out content that's already present
    const new_parts = this._content
      .split('\n')
      .filter((line) => line.trim() && !existing.includes(line));

    if (new_parts.length > 0) {
      const combined = existing
        ? `${existing}\n${new_parts.join('\n')}`
        : new_parts.join('\n');
      await this.claude.setAccountInstructions(combined);
      await logger.info('migrate', `✓ Pushed instructions → Claude account`);
    } else {
      await logger.info('migrate', `Instructions already present in Claude — skipped`);
    }

    return '';
  }
}
