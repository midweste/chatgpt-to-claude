/**
 * Pluggable instruction interface.
 */
import type { ChatGPTRawInstructions } from './chatgpt-api-types';

export interface IInstruction {
  readonly data: ChatGPTRawInstructions;
  readonly about_user: string | null;
  readonly about_model: string | null;
}
