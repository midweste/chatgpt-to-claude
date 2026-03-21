/**
 * ChatGPT source adapter — domain operations.
 *
 * Composes ChatGPTAuth (session management) and ChatGPTHttp (transport)
 * to provide high-level conversation, project, and memory operations.
 * Parallels the Claude pattern (ClaudeDestination → ClaudeAuth + ClaudeHttp).
 */

import type { Source } from '../interfaces/source';
import type { Project } from '../interfaces/project';
import type { ChatGPTRawConversation, ChatGPTConversationList, ChatGPTRawMemory, ChatGPTMemoriesResponse, ChatGPTRawInstructions } from '../interfaces/chatgpt-api-types';
import { safeTimestamp } from '../utils/timestamp';
import { sleep } from '../utils/retry';
import { sendConversationMessage as sendMessage } from './chatgpt-messaging';
import { logger } from '../services/logger';
import { ChatGPTAuth } from './chatgpt-auth';
import { ChatGPTHttp } from './chatgpt-http';

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 500;
const CONCURRENCY = 3;
const WAVE_DELAY_MS = 500;

export class ChatGPTSource implements Source {
  readonly id = 'chatgpt';
  readonly name = 'ChatGPT';

  private readonly auth: ChatGPTAuth;
  private readonly http: ChatGPTHttp;

  constructor() {
    this.auth = new ChatGPTAuth();
    this.http = new ChatGPTHttp(this.auth);
  }

  // ── Auth delegation ────────────────────────────────────────

  get isAuthenticated(): boolean {
    return this.auth.isAuthenticated();
  }

  async restoreSession(): Promise<boolean> {
    return this.auth.restoreSession(async () => {
      await this.http.get<Record<string, unknown>>('/backend-api/me');
    });
  }

  async authenticate(): Promise<void> {
    return this.auth.authenticate();
  }

  // ── Conversations ──────────────────────────────────────────

  async *listConversations(
    onProgress?: (loaded: number, total: number) => void,
  ): AsyncGenerator<ChatGPTRawConversation[]> {
    let offset = 0;

    while (true) {
      const page = await this.http.get<ChatGPTConversationList>(
        `/backend-api/conversations?limit=100&offset=${offset}`,
      );

      const items = page.items.map((item) => ({
        ...item,
        id: (item.id ?? item.conversation_id) as string,
      }));

      yield items;

      offset += page.items.length;
      onProgress?.(offset, page.total);

      if (offset >= page.total) break;
      await sleep(BATCH_DELAY_MS);
    }
  }

  async getConversation(id: string): Promise<ChatGPTRawConversation> {
    const conv = await this.http.get<ChatGPTRawConversation>(
      `/backend-api/conversation/${id}`,
    );

    return {
      ...conv,
      id: (conv.conversation_id ?? conv.id ?? id) as string,
    };
  }

  async downloadAll(
    ids: string[],
    onProgress?: (downloaded: number, total: number) => void,
    startFrom = 0,
  ): Promise<ChatGPTRawConversation[]> {
    const results: ChatGPTRawConversation[] = [];
    const waveSize = BATCH_SIZE * CONCURRENCY;

    for (let waveStart = startFrom; waveStart < ids.length; waveStart += waveSize) {
      const batchPromises: Array<Promise<Array<ChatGPTRawConversation>>> = [];

      for (let b = 0; b < CONCURRENCY; b++) {
        const batchOffset = waveStart + b * BATCH_SIZE;
        if (batchOffset >= ids.length) break;
        const batchIds = ids.slice(batchOffset, batchOffset + BATCH_SIZE);

        batchPromises.push(this.downloadBatch(batchIds));
      }

      const batchResults = await Promise.all(batchPromises);

      for (const conv of batchResults.flat()) {
        results.push({
          ...conv,
          id: (conv.id ?? conv.conversation_id) as string,
        });
      }

      onProgress?.(Math.min(waveStart + waveSize, ids.length), ids.length);
      await sleep(WAVE_DELAY_MS);
    }

    return results;
  }

  // ── Projects ───────────────────────────────────────────────

  async getProjects(): Promise<Project[]> {
    try {
      const raw = await this.http.get<Record<string, unknown>>(
        '/backend-api/gizmos/snorlax/sidebar?owned_only=true&conversations_per_gizmo=0',
      );
      await logger.debug('ChatGPT', `Gizmos sidebar raw keys: ${Object.keys(raw).join(', ')}`);

      const items = (raw.items as Array<Record<string, unknown>>) || [];
      const projects: Project[] = [];

      for (const item of items) {
        const outerGizmo = item.gizmo as Record<string, unknown> | undefined;
        const gizmo = (outerGizmo?.gizmo ?? item.resource) as Record<string, unknown> | undefined;
        const id = (gizmo?.id ?? gizmo?.short_url ?? item.id) as string;
        if (!id || !id.startsWith('g-p-')) continue;

        const display = gizmo?.display as Record<string, unknown> | undefined;
        const name = (display?.name ?? gizmo?.name ?? gizmo?.short_url ?? 'Untitled Project') as string;
        const description = (gizmo?.instructions ?? display?.description ?? '') as string;
        await logger.debug('ChatGPT', `Project "${name}" gizmo keys: ${gizmo ? Object.keys(gizmo).join(', ') : 'null'}`);

        let conversationIds: string[] = [];
        try {
          const convRaw = await this.http.get<Record<string, unknown>>(
            `/backend-api/gizmos/${id}/conversations?cursor=0`,
          );
          const convItems = (convRaw.items as Array<Record<string, unknown>>) ||
            (convRaw.conversations as Array<Record<string, unknown>>) || [];
          conversationIds = convItems.map((c) => (c.id ?? c.conversation_id) as string);
          await logger.debug('ChatGPT', `Project "${name}": ${conversationIds.length} conversations`);
        } catch (err) {
          await logger.warn('ChatGPT', `Could not fetch conversations for project "${name}": ${err instanceof Error ? err.message : String(err)}`);
        }

        projects.push({
          id,
          name,
          description: description || undefined,
          created_at: safeTimestamp(gizmo?.created_at ?? item.created_at),
          updated_at: safeTimestamp(gizmo?.updated_at ?? item.updated_at),
          conversation_ids: conversationIds,
        });
      }

      await logger.info('ChatGPT', `Found ${projects.length} projects: ${projects.map(p => `${p.name} (${p.conversation_ids.length} convs)`).join(', ')}`);
      return projects;
    } catch (err) {
      await logger.warn('ChatGPT', `Failed to fetch projects: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  // ── Memories + Instructions ────────────────────────────────

  async getMemories(): Promise<ChatGPTRawMemory[]> {
    try {
      const raw = await this.http.get<ChatGPTMemoriesResponse>(
        '/backend-api/memories?include_memory_entries=true',
      );
      const items = raw.memories || raw.results ||
        (Array.isArray(raw) ? raw as ChatGPTRawMemory[] : []);
      await logger.info('ChatGPT', `Found ${items.length} memories`);
      return items.map((mem) => ({
        ...mem,
        id: mem.id as string,
      }));
    } catch (err) {
      await logger.warn('ChatGPT', `Failed to fetch memories: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  async getInstructions(): Promise<ChatGPTRawInstructions | null> {
    try {
      try {
        return await this.http.get<ChatGPTRawInstructions>(
          '/backend-api/user_system_messages',
        );
      } catch { /* user_system_messages not available — fall back to settings/user */
        return await this.http.get<ChatGPTRawInstructions>(
          '/backend-api/settings/user',
        );
      }
    } catch (err) {
      await logger.warn('ChatGPT', `Failed to fetch instructions: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  // ── Messaging ──────────────────────────────────────────────

  async sendConversationMessage(prompt: string): Promise<string> {
    return sendMessage(prompt, this.http.headers(), () => this.http.getOrCreateDeviceId());
  }

  // ── Private helpers ────────────────────────────────────────

  private async downloadBatch(ids: string[]): Promise<Array<ChatGPTRawConversation>> {
    try {
      const raw = await this.http.post<unknown>('/backend-api/conversations/batch', {
        conversation_ids: ids,
      });
      if (Array.isArray(raw)) return raw as Array<ChatGPTRawConversation>;
      return [];
    } catch (batchErr: unknown) {
      await logger.warn('ChatGPT', `Batch endpoint failed, falling back to individual downloads: ${batchErr instanceof Error ? batchErr.message : String(batchErr)}`);
      const results: Array<ChatGPTRawConversation> = [];
      for (const id of ids) {
        try {
          const conv = await this.http.get<ChatGPTRawConversation>(
            `/backend-api/conversation/${id}`,
          );
          results.push(conv);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          await logger.error('ChatGPT', `Failed conversation ${id}: ${msg}`);
        }
        await sleep(BATCH_DELAY_MS);
      }
      return results;
    }
  }
}
