/**
 * Claude session authentication — cookie-based session via Chrome extension.
 *
 * Handles reading session cookies from the background script,
 * restoring sessions, and exposing org/session state.
 */

import { CLAUDE_BASE } from '../constants/claude';

interface ClaudeSession {
  sessionKey: string;
  organizationId: string;
}

export class ClaudeAuth {
  private session: ClaudeSession | null = null;

  isAuthenticated(): boolean {
    return this.session !== null;
  }

  getOrganizationId(): string | null {
    return this.session?.organizationId ?? null;
  }

  /**
   * Read the org ID, throwing if not authenticated.
   * Used internally by the HTTP layer.
   */
  requireOrgId(): string {
    if (!this.session) throw new Error('Not authenticated with Claude');
    return this.session.organizationId;
  }

  /**
   * Authenticate by reading session cookies via background script,
   * then validate the session with a lightweight API call.
   */
  async authenticate(): Promise<void> {
    const response = await chrome.runtime.sendMessage({ action: 'get-claude-session' });
    if (!response) {
      throw new Error('No response from background script. Make sure you are logged into claude.ai and reload the extension.');
    }
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.organizationId) {
      throw new Error('Could not determine Claude organization ID. Please visit claude.ai and try again.');
    }
    this.session = {
      sessionKey: response.sessionKey,
      organizationId: response.organizationId,
    };

    // Validate session with a real API call — catches expired/revoked cookies
    // before we claim "connected".
    await this.validateSession();
  }

  /**
   * Restore session if cookies are still valid.
   */
  async restoreSession(): Promise<boolean> {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'check-claude-login' });
      if (!response.loggedIn) return false;
      await this.authenticate(); // authenticate() now includes validation
      return true;
    } catch { /* session cookies invalid or expired — user must re-authenticate */
      this.session = null;
      return false;
    }
  }

  /**
   * Validate the current session by making a lightweight API call.
   * Only 401/403 invalidates the session. Other errors are logged
   * but don't block connection — real failures will surface on use.
   */
  private async validateSession(): Promise<void> {
    const result = await chrome.runtime.sendMessage({
      action: 'api-proxy',
      url: `${CLAUDE_BASE}/organizations/${this.session!.organizationId}/chat_conversations?limit=1`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-organization-uuid': this.session!.organizationId,
        'anthropic-client-platform': 'web_claude_ai',
      },
    });

    // Clear auth failures — session is definitively expired
    if (result.status === 401 || result.status === 403) {
      this.session = null;
      throw new Error(
        'Claude session has expired. Please log into claude.ai in your browser and try again.',
      );
    }

    // Non-auth errors (404, 500, network) — let the user through;
    // real failures will be caught when they actually use the API.
  }
}
