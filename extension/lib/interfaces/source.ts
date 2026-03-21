/**
 * Source adapter interface — extract data from an AI platform.
 */

import type { Project } from './project';
import type { ChatGPTRawConversation, ChatGPTRawMemory, ChatGPTRawInstructions } from './chatgpt-api-types';

export interface Source {
  id: string;
  name: string;
  authenticate(): Promise<void>;
  listConversations(
    onProgress?: (loaded: number, total: number) => void,
  ): AsyncGenerator<ChatGPTRawConversation[]>;
  getConversation(id: string): Promise<ChatGPTRawConversation>;
  getProjects(): Promise<Project[]>;
  getMemories(): Promise<ChatGPTRawMemory[]>;
  getInstructions(): Promise<ChatGPTRawInstructions | null>;
}
