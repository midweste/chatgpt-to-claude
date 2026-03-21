/**
 * Claude HTTP transport — proxied API requests via Chrome background script.
 *
 * Handles request construction, header management, and error formatting.
 * Retry logic with exponential backoff is delegated to the shared withRetry utility.
 * All requests are proxied through the background service worker
 * to attach proper Cookie/Origin/Referer headers.
 */

import { ClaudeAuth } from './claude-auth';
import { withRetry, shouldRetryNoRetry } from '../utils/retry';
import { CLAUDE_BASE } from '../constants/claude';
const MAX_RETRIES = 3;
const BASE_DELAYS = [10_000, 30_000, 60_000] as const;

export class ClaudeHttp {
  private readonly auth: ClaudeAuth;
  constructor(auth: ClaudeAuth) {
    this.auth = auth;
  }

  async get<T>(path: string): Promise<T> {
    return this.request('GET', path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request('POST', path, body);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request('PUT', path, body);
  }

  /**
   * Build the organization-scoped URL prefix.
   */
  orgPath(): string {
    return `/organizations/${this.auth.requireOrgId()}`;
  }

  /**
   * Proxy a request through the background service worker.
   * Retries on 403 (Cloudflare challenge) and 429 (rate limit).
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return withRetry(
      async () => {
        const result = await chrome.runtime.sendMessage({
          action: 'api-proxy',
          url: `${CLAUDE_BASE}${path}`,
          method,
          headers: this.headers(),
          body: body && method !== 'GET' ? body : undefined,
        });

        if (result.status === 403 || result.status === 429) {
          // Auth-failure 403s should not be retried — only Cloudflare challenges
          const body = result.body || '';
          const is_auth_failure = result.status === 403 &&
            (body.includes('permission_error') || body.includes('session_invalid'));
          const is_rate_limit = result.status === 429;

          throw Object.assign(
            new Error(
              is_auth_failure
                ? 'Claude session has expired. Please log into claude.ai in your browser and reconnect.'
                : is_rate_limit
                  ? 'Claude rate limit reached. The queue will auto-pause.'
                  : `HTTP ${result.status} on ${method} ${path}`,
            ),
            { status: result.status, noRetry: is_auth_failure, isRateLimit: is_rate_limit },
          );
        }

        if (result.error) {
          throw Object.assign(
            new Error(`Claude API ${method} ${path} failed: ${result.error} — ${(result.body || '').substring(0, 200)}`),
            { status: result.status, noRetry: true },
          );
        }

        return result.data as T;
      },
      {
        max_retries: MAX_RETRIES,
        delays: BASE_DELAYS,
        jitter_ms: 5_000,
        source: 'Claude',
        should_retry: shouldRetryNoRetry,
      },
    );
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-organization-uuid': this.auth.requireOrgId(),
      'anthropic-client-platform': 'web_claude_ai',
    };
  }
}

