/**
 * ChatGPT instruction wrapper — typed getters over raw API data.
 */

import type { IInstruction } from '../interfaces/instruction';
import type { ChatGPTRawInstructions } from '../interfaces/chatgpt-api-types';

export class ChatGPTInstruction implements IInstruction {
  readonly data: ChatGPTRawInstructions;
  constructor(data: ChatGPTRawInstructions) {
    this.data = data;
  }

  get about_user(): string | null {
    return (this.data.about_user_message as string) || null;
  }

  get about_model(): string | null {
    return (this.data.about_model_message as string) || null;
  }
}
