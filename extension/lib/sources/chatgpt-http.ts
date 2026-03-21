/**
 * ChatGPT HTTP transport — proxied API requests via Chrome background script.
 *
 * Handles request construction, header management, and retry logic.
 * Parallels ClaudeHttp in the destination layer.
 */

import { ChatGPTAuth } from './chatgpt-auth';
import { withRetry, shouldRetryNoRetry } from '../utils/retry';
import { USER_AGENT } from '../constants/shared';
import { CHATGPT_BASE } from '../constants/chatgpt';

const BATCH_DELAY_MS = 500;
const RETRY_DELAY_MS = 30_000;
const MAX_RETRIES = 3;

export class ChatGPTHttp {
  private readonly auth: ChatGPTAuth;

  constructor(auth: ChatGPTAuth) {
    this.auth = auth;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  /**
   * Build standard ChatGPT API headers using the current auth token.
   */
  headers(extra?: Record<string, string>): Record<string, string> {
    const base: Record<string, string> = {
      Authorization: `Bearer ${this.auth.requireToken()}`,
      'Content-Type': 'application/json',
      ...extra,
    };
    if (USER_AGENT) base['User-Agent'] = USER_AGENT;
    return base;
  }

  /**
   * Get or create a persistent device ID for the oai-device-id header.
   * ChatGPT requires this for conversation creation.
   */
  async getOrCreateDeviceId(): Promise<string> {
    const result = await chrome.storage.local.get('oai_device_id');
    if (result.oai_device_id) return result.oai_device_id as string;
    const id = crypto.randomUUID();
    await chrome.storage.local.set({ oai_device_id: id });
    return id;
  }

  /**
   * Proxy a request through the background service worker.
   * Retries on 429 (rate limit) with configurable delay.
   */
  private async request<T>(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    return withRetry(
      async () => {
        const result = await chrome.runtime.sendMessage({
          action: 'api-proxy',
          url: `${CHATGPT_BASE}${path}`,
          method,
          headers: this.headers(extraHeaders),
          body: body && method !== 'GET' ? body : undefined,
        });

        if (result.status === 429) {
          throw Object.assign(
            new Error(`Rate limited on ${path}`),
            { status: 429, retryDelay: RETRY_DELAY_MS },
          );
        }

        if (result.error) {
          // Don't retry client errors (4xx) except 429
          if (result.status >= 400 && result.status < 500) {
            throw Object.assign(
              new Error(`HTTP ${result.status} on ${method} ${path}: ${result.body ?? ''}`),
              { noRetry: true },
            );
          }
          throw new Error(`HTTP ${result.status} on ${method} ${path}`);
        }

        return result.data as T;
      },
      {
        max_retries: MAX_RETRIES,
        delays: BATCH_DELAY_MS,
        source: 'ChatGPT',
        should_retry: shouldRetryNoRetry,
      },
    );
  }
}
