/**
 * ChatGPT session authentication — cookie-based token exchange via Chrome extension.
 *
 * Handles reading session cookies from the background script,
 * exchanging them for access tokens, and persisting/restoring sessions.
 */

import { logger } from '../services/logger';

export class ChatGPTAuth {
  private accessToken: string | null = null;

  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  /**
   * Get the current access token, throwing if not authenticated.
   * Used internally by the HTTP layer.
   */
  requireToken(): string {
    if (!this.accessToken) {
      throw new Error('Not authenticated — call authenticate() first');
    }
    return this.accessToken;
  }

  /**
   * Exchange the session cookie for an access token via the background script.
   */
  async authenticate(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      throw new Error(
        'Chrome extension APIs not available. Open this dashboard from the extension popup, not localhost.',
      );
    }

    const response = await new Promise<{ accessToken?: string; error?: string }>((resolve) => {
      chrome.runtime.sendMessage({ action: 'get-access-token' }, resolve);
    });

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.accessToken) {
      throw new Error('No accessToken returned from background script');
    }

    this.accessToken = response.accessToken;
    await chrome.storage.local.set({ chatgpt_access_token: this.accessToken });
  }

  /**
   * Try to restore a previously saved session token. Returns true if valid.
   */
  async restoreSession(validate: () => Promise<void>): Promise<boolean> {
    const result = await chrome.storage.local.get('chatgpt_access_token');
    const saved = result.chatgpt_access_token as string | undefined;
    if (!saved) return false;

    this.accessToken = saved;
    try {
      await validate();
      return true;
    } catch { /* token expired or invalid — clear and let caller re-authenticate */
      // Token expired or invalid
      this.accessToken = null;
      await chrome.storage.local.remove('chatgpt_access_token');
      await logger.debug('ChatGPT', 'Saved access token invalid, cleared');
      return false;
    }
  }
}
