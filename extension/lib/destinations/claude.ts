/**
 * Claude destination adapter — domain operations.
 *
 * Composes ClaudeAuth (session management) and ClaudeHttp (transport)
 * to provide high-level conversation, project, and usage operations.
 */

import { ClaudeAuth } from './claude-auth';
import { ClaudeHttp } from './claude-http';
import type { IDestination } from '../interfaces/destination';
import { withRetry, shouldRetryNoRetry } from '../utils/retry';
import { parseClaudeSSE } from '../utils/sse-parser';
import { CLAUDE_BASE, CLAUDE_DEFAULT_MODEL } from '../constants/claude';
import { logger } from '../services/logger';

/** Null parent UUID used when starting a new conversation turn with no prior context. */
const NULL_PARENT_UUID = '00000000-0000-4000-8000-000000000000';

/** A single rate-limit window from the /usage endpoint. */
export interface UsageWindow {
  /** Percentage of limit consumed (0–100). */
  utilization: number;
  /** ISO 8601 timestamp when the window resets. */
  resets_at: string;
}

/** Response from GET /organizations/{org_id}/usage. */
export interface ClaudeUsage {
  five_hour: UsageWindow | null;
  seven_day: UsageWindow | null;
  seven_day_oauth_apps: UsageWindow | null;
  seven_day_opus: UsageWindow | null;
  seven_day_sonnet: UsageWindow | null;
  seven_day_cowork: UsageWindow | null;
  iguana_necktie: UsageWindow | null;
  extra_usage: {
    is_enabled: boolean;
    monthly_limit: number | null;
    used_credits: number | null;
    utilization: number | null;
  } | null;
}

export class ClaudeDestination implements IDestination {
  readonly id = 'claude';
  readonly name = 'Claude';

  private readonly auth: ClaudeAuth;
  private readonly http: ClaudeHttp;

  constructor() {
    this.auth = new ClaudeAuth();
    this.http = new ClaudeHttp(this.auth);
  }

  // ── Auth delegation ────────────────────────────────────────

  isAuthenticated(): boolean {
    return this.auth.isAuthenticated();
  }

  getOrganizationId(): string | null {
    return this.auth.getOrganizationId();
  }

  async authenticate(): Promise<void> {
    return this.auth.authenticate();
  }

  async restoreSession(): Promise<boolean> {
    return this.auth.restoreSession();
  }

  // ── Projects ───────────────────────────────────────────────

  /** Cached project name→uuid map (case-insensitive keys). Populated lazily on first resolve. */
  private project_cache: Map<string, string> | null = null;

  /**
   * Eagerly populate the project cache. Call during connect/hydrate
   * so the cache is warm before the first push, avoiding unnecessary
   * API round-trips and duplicate creation from empty-cache misses.
   */
  async prewarmProjectCache(): Promise<void> {
    await this.refreshProjectCache();
    await logger.debug('projects', `Project cache prewarmed: ${this.project_cache!.size} projects`);
  }

  /** In-flight resolves — prevents duplicate creation from concurrent calls for the same name. */
  private project_resolve_in_flight = new Map<string, Promise<string>>();

  /**
   * Resolve a project name to its UUID, creating the project if it doesn't exist.
   * Uses an internal cache as fast-path but always re-checks the API before
   * creating — guarantees no duplicate projects.
   *
   * Concurrent calls for the same name are coalesced via an in-flight promise map
   * to prevent duplicates from race conditions or API eventual consistency.
   */
  async resolveOrCreateProject(name: string, description = ''): Promise<string> {
    const key = name.toLowerCase();

    // Fast path: check cache
    if (this.project_cache?.has(key)) {
      return this.project_cache.get(key)!;
    }

    // Coalesce concurrent calls for the same project name
    if (this.project_resolve_in_flight.has(key)) {
      return this.project_resolve_in_flight.get(key)!;
    }

    const promise = this.doResolveOrCreate(key, name, description);
    this.project_resolve_in_flight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.project_resolve_in_flight.delete(key);
    }
  }

  private async doResolveOrCreate(key: string, name: string, description: string): Promise<string> {
    // Slow path: refresh cache from API before creating
    await this.refreshProjectCache();

    if (this.project_cache!.has(key)) {
      await logger.debug('projects', `resolveOrCreateProject("${name}") → cache HIT after refresh (uuid=${this.project_cache!.get(key)})`);
      return this.project_cache!.get(key)!;
    }

    // Confirmed missing after fresh API check — safe to create
    await logger.info('projects', `resolveOrCreateProject("${name}") → cache MISS after refresh (cache has ${this.project_cache!.size} entries: [${[...this.project_cache!.keys()].join(', ')}]). Creating...`);
    const created = await this.createProject(name, description);
    this.project_cache!.set(key, created.uuid);
    await logger.info('projects', `Created project "${name}" → ${created.uuid}`);
    return created.uuid;
  }

  /**
   * Refresh the project cache from Claude API.
   * Merges API results into existing cache to preserve locally-created entries
   * that may not yet appear in the API response due to eventual consistency.
   */
  private async refreshProjectCache(): Promise<void> {
    const existing = this.project_cache ?? new Map<string, string>();
    const list = await this.listProjects();
    for (const p of list) {
      if (p.name) existing.set(p.name.toLowerCase(), p.uuid);
    }
    this.project_cache = existing;
    await logger.debug('projects', `refreshProjectCache: ${list.length} from API, ${existing.size} total in cache`);
  }

  async createProject(name: string, description: string): Promise<{ uuid: string }> {
    return this.http.post(`${this.http.orgPath()}/projects`, {
      name,
      description,
      is_private: true,
    });
  }

  async setProjectInstructions(projectId: string, instructions: string): Promise<void> {
    await this.http.put(`${this.http.orgPath()}/projects/${projectId}`, {
      prompt_template: instructions,
    });
  }

  async listProjects(): Promise<Array<{ uuid: string; name: string }>> {
    const PAGE_SIZE = 100;
    const all: Array<{ uuid: string; name: string }> = [];
    let offset = 0;

    for (;;) {
      const raw = await this.http.get<unknown>(
        `${this.http.orgPath()}/projects_v2?limit=${PAGE_SIZE}&offset=${offset}&filter=is_creator`,
      );

      // Handle both array responses and wrapped object responses
      let page: Array<{ uuid: string; name: string }>;
      if (Array.isArray(raw)) {
        page = raw;
      } else if (raw && typeof raw === 'object') {
        // Claude API may wrap results in an object — try common keys
        const obj = raw as Record<string, unknown>;
        const candidates = obj.data ?? obj.results ?? obj.projects ?? obj.items;
        if (Array.isArray(candidates)) {
          page = candidates as Array<{ uuid: string; name: string }>;
          await logger.debug('projects', `listProjects: response was wrapped object (keys: ${Object.keys(obj).join(', ')}), extracted ${page.length} items`);
        } else {
          await logger.warn('projects', `listProjects: unexpected response shape — ${JSON.stringify(raw).substring(0, 300)}`);
          break;
        }
      } else {
        await logger.warn('projects', `listProjects: unexpected response type — ${typeof raw}`);
        break;
      }

      if (page.length === 0) break;
      all.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    return all;
  }

  async moveToProject(conversationUuids: string[], projectUuid: string): Promise<void> {
    await this.http.post(`${this.http.orgPath()}/chat_conversations/move_many`, {
      conversation_uuids: conversationUuids,
      project_uuid: projectUuid,
    });
  }

  // ── Conversations ──────────────────────────────────────────

  async createConversation(name?: string): Promise<{ uuid: string }> {
    const uuid = crypto.randomUUID();
    await this.http.post(`${this.http.orgPath()}/chat_conversations`, {
      uuid,
      name: name || '',
      include_conversation_preferences: true,
      is_temporary: false,
    });
    return { uuid };
  }

  async renameConversation(convId: string, name: string): Promise<void> {
    await this.http.put(`${this.http.orgPath()}/chat_conversations/${convId}`, {
      name,
    });
  }

  /**
   * Send a message to a conversation. Returns the response text.
   * Proxied through background script to avoid Cloudflare detection.
   */
  async sendMessage(convId: string, prompt: string, parentUuid?: string, model?: string): Promise<string> {
    const BASE_DELAYS = [10_000, 30_000, 60_000] as const;

    return withRetry(
      async () => {
        const result = await chrome.runtime.sendMessage({
          action: 'api-proxy',
          url: `${CLAUDE_BASE}/organizations/${this.auth.requireOrgId()}/chat_conversations/${convId}/completion`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-organization-uuid': this.auth.requireOrgId(),
            'anthropic-client-platform': 'web_claude_ai',
            'Accept': 'text/event-stream',
          },
          body: {
            prompt,
            parent_message_uuid: parentUuid || NULL_PARENT_UUID,
            model: model || CLAUDE_DEFAULT_MODEL,
            tools: [],
            rendering_mode: 'messages',
          },
        });

        if (result.status === 403 || result.status === 429) {
          throw Object.assign(
            new Error(`HTTP ${result.status} on sendMessage`),
            { status: result.status },
          );
        }

        if (result.error) {
          throw Object.assign(
            new Error(`Completion failed: ${result.error}`),
            { noRetry: true },
          );
        }

        // Parse SSE events from response text to extract assistant reply
        const raw = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
        return parseClaudeSSE(raw);
      },
      {
        max_retries: 3,
        delays: BASE_DELAYS,
        jitter_ms: 5_000,
        source: 'Claude',
        should_retry: shouldRetryNoRetry,
      },
    );
  }

  async listConversations(): Promise<Array<{ uuid: string; name: string }>> {
    const PAGE_SIZE = 500;
    const all: Array<{ uuid: string; name: string }> = [];
    let offset = 0;

    for (;;) {
      const page = await this.http.get<Array<{ uuid: string; name: string }>>(
        `${this.http.orgPath()}/chat_conversations?limit=${PAGE_SIZE}&offset=${offset}`,
      );

      if (!Array.isArray(page) || page.length === 0) break;
      all.push(...page);
      if (page.length < PAGE_SIZE) break; // Last page
      offset += PAGE_SIZE;
    }

    return all;
  }

  async fetchExistingTitles(): Promise<Set<string>> {
    const convs = await this.listConversations();
    const titles = new Set<string>();
    for (const c of convs) {
      if (c.name) {
        titles.add(c.name);
        titles.add(c.name.replace(/^\[GPT\]\s*/i, ''));
      }
    }
    return titles;
  }

  // ── Instructions + Documents ───────────────────────────────

  async getAccountInstructions(): Promise<string> {
    const profile = await this.http.get<{ conversation_preferences?: string }>('/account_profile');
    return profile?.conversation_preferences || '';
  }

  async setAccountInstructions(instructions: string): Promise<void> {
    await this.http.put('/account_profile', {
      conversation_preferences: instructions,
    });
  }

  async uploadDocument(projectId: string, fileName: string, content: string): Promise<void> {
    await this.http.post(`${this.http.orgPath()}/projects/${projectId}/docs`, {
      file_name: fileName,
      content,
    });
  }

  // ── Usage ──────────────────────────────────────────────────

  async getUsage(): Promise<ClaudeUsage> {
    return this.http.get<ClaudeUsage>(`${this.http.orgPath()}/usage`);
  }
}
