/**
 * Service worker for AI Migration extension.
 *
 * Handles cookie access, token exchange, API proxying, and recording
 * for the dashboard. The dashboard page sends messages here since
 * chrome.cookies is only available in the service worker context.
 *
 * Message handlers are organized as a dispatch map (see `handlers` below).
 */

import { CHATGPT_BASE } from './lib/constants/chatgpt';
import { USER_AGENT } from './lib/constants/shared';

const COOKIE_NAME = '__Secure-next-auth.session-token';

/**
 * Get the ChatGPT session cookie value.
 *
 * Personal accounts use a single `__Secure-next-auth.session-token` cookie.
 * Team/workspace accounts exceed the ~4KB cookie limit, so NextAuth splits
 * the JWT into numbered chunks: `.0`, `.1`, `.2`, etc.
 *
 * Returns the cookie value (reassembled if chunked) or null if not logged in.
 */
async function getChatGPTSessionCookie(): Promise<string | null> {
  // Try the single (non-chunked) cookie first — personal accounts
  const single = await chrome.cookies.get({ url: CHATGPT_BASE, name: COOKIE_NAME });
  if (single) return single.value;

  // Try chunked cookies — Team/workspace accounts
  const allCookies = await chrome.cookies.getAll({ url: CHATGPT_BASE });
  const chunks = allCookies
    .filter((c) => c.name.startsWith(`${COOKIE_NAME}.`))
    .sort((a, b) => {
      const numA = parseInt(a.name.split('.').pop() || '0', 10);
      const numB = parseInt(b.name.split('.').pop() || '0', 10);
      return numA - numB;
    });

  if (chunks.length === 0) return null;
  return chunks.map((c) => c.value).join('');
}

// ── Types ──

interface RecordedEntry {
  timestamp: string;
  method: string;
  url: string;
  type: string;
  body: unknown;
  headers: Record<string, string> | null;
}

interface ProxyMessage {
  action: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

type SendResponse = (response: Record<string, unknown>) => void;
type Handler = (msg: ProxyMessage, sendResponse: SendResponse) => boolean;

// ── API Request Recorder ──
// Captures network requests to chatgpt.com and claude.ai when recording is enabled.
let recording = false;
const MAX_RECORDINGS = 200;

// Restore recording state from chrome.storage on service worker startup
chrome.storage.local.get({ recording_active: false }, (result) => {
  recording = result.recording_active as boolean;
});

// Temporary map to hold headers until onBeforeRequest fires
const pendingHeaders = new Map<string, Record<string, string>>();

function onBeforeSendHeaders(
  details: chrome.webRequest.OnBeforeSendHeadersDetails,
): chrome.webRequest.BlockingResponse | undefined {
  if (!recording) return;
  // Store headers keyed by requestId for merge in onBeforeRequest
  const headers: Record<string, string> = {};
  for (const h of details.requestHeaders || []) {
    if (h.value) headers[h.name] = h.value;
  }
  pendingHeaders.set(details.requestId, headers);
  // Clean up stale entries after 5s
  setTimeout(() => pendingHeaders.delete(details.requestId), 5000);
}

function onBeforeRequest(
  details: chrome.webRequest.OnBeforeRequestDetails,
): chrome.webRequest.BlockingResponse | undefined {
  if (!recording) return;

  // Parse requestBody if available
  let body: unknown = null;
  if (details.requestBody) {
    if (details.requestBody.raw && details.requestBody.raw.length > 0) {
      try {
        const decoder = new TextDecoder();
        const bytes = details.requestBody.raw[0].bytes;
        if (bytes) {
          let decoded: unknown = decoder.decode(bytes);
          // Try to parse as JSON for readability
          try { decoded = JSON.parse(decoded as string); } catch { /* keep as string */ }
          body = decoded;
        }
      } catch { /* ignore decode errors */ }
    } else if (details.requestBody.formData) {
      body = details.requestBody.formData;
    }
  }

  // Merge captured headers if available
  const headers = pendingHeaders.get(details.requestId) || null;
  pendingHeaders.delete(details.requestId);

  const entry: RecordedEntry = {
    timestamp: new Date().toISOString(),
    method: details.method,
    url: details.url,
    type: details.type,
    body,
    headers,
  };

  // Store in chrome.storage.local
  chrome.storage.local.get({ recorded_requests: [] }, (result) => {
    const recordings = result.recorded_requests as RecordedEntry[];
    recordings.push(entry);
    // Keep only last MAX_RECORDINGS entries
    if (recordings.length > MAX_RECORDINGS) {
      recordings.splice(0, recordings.length - MAX_RECORDINGS);
    }
    chrome.storage.local.set({ recorded_requests: recordings });
  });
}

const REQUEST_FILTER: chrome.webRequest.RequestFilter = {
  urls: ['https://chatgpt.com/*', 'https://claude.ai/*', 'https://*.anthropic.com/*'],
  types: ['xmlhttprequest'],
};

// Register webRequest listeners
chrome.webRequest.onBeforeSendHeaders.addListener(
  onBeforeSendHeaders,
  REQUEST_FILTER,
  ['requestHeaders'],
);

chrome.webRequest.onBeforeRequest.addListener(
  onBeforeRequest,
  REQUEST_FILTER,
  ['requestBody'],
);

// Open dashboard directly when toolbar icon is clicked (no popup)
chrome.action.onClicked.addListener(async () => {
  const dashboardUrl = chrome.runtime.getURL('dist/dashboard/index.html');
  // Reuse existing dashboard tab if open
  const tabs = await chrome.tabs.query({ url: dashboardUrl });
  if (tabs.length > 0 && tabs[0].id) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: dashboardUrl });
  }
});

// ── Message Handlers ──
// Each handler receives (msg, sendResponse) and returns a boolean:
//   true  = sendResponse will be called asynchronously
//   false = sendResponse was called synchronously

function handleCheckChatgptLogin(_msg: ProxyMessage, sendResponse: SendResponse): boolean {
  getChatGPTSessionCookie().then((value) => {
    sendResponse({ loggedIn: value !== null });
  });
  return true;
}

function handleGetAccessToken(_msg: ProxyMessage, sendResponse: SendResponse): boolean {
  (async () => {
    try {
      const sessionValue = await getChatGPTSessionCookie();
      if (!sessionValue) {
        sendResponse({ error: 'Not logged into ChatGPT. Please log in at chatgpt.com first.' });
        return;
      }

      // Build cookie header — for chunked cookies, send all chunks individually
      // so NextAuth's server-side can reassemble them
      const allCookies = await chrome.cookies.getAll({ url: CHATGPT_BASE });
      const sessionCookies = allCookies.filter(
        (c) => c.name === COOKIE_NAME || c.name.startsWith(`${COOKIE_NAME}.`),
      );
      const cookieStr = sessionCookies.map((c) => `${c.name}=${c.value}`).join('; ');

      const headers: Record<string, string> = { Cookie: cookieStr };
      if (USER_AGENT) headers['User-Agent'] = USER_AGENT;
      const res = await fetch(`${CHATGPT_BASE}/api/auth/session`, { headers });

      if (!res.ok) {
        sendResponse({ error: `Session exchange failed: HTTP ${res.status}` });
        return;
      }
      const data = await res.json();
      if (!data.accessToken) {
        sendResponse({ error: 'No accessToken in session response — token may be expired' });
        return;
      }
      sendResponse({ accessToken: data.accessToken });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      sendResponse({ error: message });
    }
  })();
  return true;
}

function handleCheckClaudeLogin(_msg: ProxyMessage, sendResponse: SendResponse): boolean {
  chrome.cookies.get(
    { url: 'https://claude.ai', name: 'sessionKey' },
    (cookie) => {
      sendResponse({ loggedIn: !!cookie });
    },
  );
  return true;
}

function handleGetClaudeSession(_msg: ProxyMessage, sendResponse: SendResponse): boolean {
  chrome.cookies.getAll({ domain: '.claude.ai' }, (cookies) => {
    const sessionKey = cookies.find((c) => c.name === 'sessionKey');
    const lastActiveOrg = cookies.find((c) => c.name === 'lastActiveOrg');
    if (!sessionKey) {
      sendResponse({ error: 'Not logged into Claude. Please log in at claude.ai first.' });
      return;
    }
    sendResponse({
      sessionKey: sessionKey.value,
      organizationId: lastActiveOrg?.value || null,
    });
  });
  return true;
}

function handleOpenDashboard(_msg: ProxyMessage, sendResponse: SendResponse): boolean {
  chrome.tabs.create({ url: chrome.runtime.getURL('dist/dashboard/index.html') });
  sendResponse({ success: true });
  return false;
}

const ALLOWED_DOMAINS = ['chatgpt.com', 'claude.ai', 'anthropic.com'] as const;

function handleApiProxy(msg: ProxyMessage, sendResponse: SendResponse): boolean {
  (async () => {
    try {
      // Extract domain from URL for cookie scope
      const url = new URL(msg.url);
      const domain = url.hostname;

      // Security: only proxy to allowed domains
      const baseDomain = domain.replace(/^www\./, '');
      if (!ALLOWED_DOMAINS.some(d => baseDomain === d || baseDomain.endsWith('.' + d))) {
        sendResponse({ error: `Domain not allowed: ${baseDomain}`, status: 403 });
        return;
      }

      const cookieDomain = domain.startsWith('www.') ? domain.slice(4) : domain;

      // Get cookies for the target domain
      const cookies = await chrome.cookies.getAll({ domain: `.${cookieDomain}` });
      // Also try bare domain
      const bareCookies = await chrome.cookies.getAll({ domain: cookieDomain });
      const allCookies = [...cookies, ...bareCookies];
      const seen = new Set<string>();
      const deduped = allCookies.filter((c) => {
        const key = `${c.name}=${c.value}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const cookieStr = deduped.map((c) => `${c.name}=${c.value}`).join('; ');

      const headers: Record<string, string> = {
        ...(msg.headers || {}),
        Cookie: cookieStr,
        Origin: url.origin,
        Referer: `${url.origin}/`,
      };

      const options: RequestInit = {
        method: msg.method || 'GET',
        headers,
      };
      if (msg.body && msg.method !== 'GET') {
        options.body = typeof msg.body === 'string' ? msg.body : JSON.stringify(msg.body);
      }

      const response = await fetch(msg.url, options);
      const contentType = response.headers.get('content-type') || '';

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        sendResponse({ error: `HTTP ${response.status}`, status: response.status, body: text.substring(0, 500) });
        return;
      }

      if (response.status === 204) {
        sendResponse({ ok: true, status: 204, data: null });
        return;
      }

      if (contentType.includes('application/json')) {
        const data = await response.json();
        sendResponse({ ok: true, status: response.status, data });
      } else if (contentType.includes('text/event-stream')) {
        // SSE (completion) — drain the stream without buffering.
        // We don't use Claude's response body; discarding saves multi-MB of memory + IPC.
        const reader = response.body?.getReader();
        if (reader) { while (!(await reader.read()).done) { /* drain */ } }
        sendResponse({ ok: true, status: response.status, data: '' });
      } else {
        const text = await response.text();
        sendResponse({ ok: true, status: response.status, data: text });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      sendResponse({ error: message, status: 0 });
    }
  })();
  return true;
}

function handleStartRecording(_msg: ProxyMessage, sendResponse: SendResponse): boolean {
  recording = true;
  chrome.storage.local.set({ recorded_requests: [], recording_active: true });
  sendResponse({ ok: true });
  return false;
}

function handleStopRecording(_msg: ProxyMessage, sendResponse: SendResponse): boolean {
  recording = false;
  chrome.storage.local.set({ recording_active: false });
  sendResponse({ ok: true });
  return false;
}

function handleGetRecordingState(_msg: ProxyMessage, sendResponse: SendResponse): boolean {
  chrome.storage.local.get({ recorded_requests: [] }, (result) => {
    sendResponse({ recording, count: (result.recorded_requests as unknown[]).length });
  });
  return true;
}

function handleGetRecordings(_msg: ProxyMessage, sendResponse: SendResponse): boolean {
  chrome.storage.local.get({ recorded_requests: [] }, (result) => {
    sendResponse({ recordings: result.recorded_requests });
  });
  return true;
}

function handleClearRecordings(_msg: ProxyMessage, sendResponse: SendResponse): boolean {
  chrome.storage.local.set({ recorded_requests: [] });
  sendResponse({ ok: true });
  return false;
}

// ── Dispatch Map ──
// Maps action names to handler functions for clean routing.

const handlers: Record<string, Handler> = {
  'check-chatgpt-login': handleCheckChatgptLogin,
  'get-access-token': handleGetAccessToken,
  'check-claude-login': handleCheckClaudeLogin,
  'get-claude-session': handleGetClaudeSession,
  'open-dashboard': handleOpenDashboard,
  'api-proxy': handleApiProxy,
  'start-recording': handleStartRecording,
  'stop-recording': handleStopRecording,
  'get-recording-state': handleGetRecordingState,
  'get-recordings': handleGetRecordings,
  'clear-recordings': handleClearRecordings,
};

chrome.runtime.onMessage.addListener((msg: ProxyMessage, sender, sendResponse) => {
  // Security: only accept messages from this extension's own pages
  if (sender.id !== chrome.runtime.id) return;
  const handler = handlers[msg.action];
  if (handler) return handler(msg, sendResponse);
});
