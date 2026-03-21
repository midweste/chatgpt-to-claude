/**
 * Service worker for AI Migration extension.
 *
 * Handles cookie access, token exchange, API proxying, and recording
 * for the dashboard. The dashboard page sends messages here since
 * chrome.cookies is only available in the service worker context.
 *
 * Message handlers are organized as a dispatch map (see `handlers` below).
 */

const CHATGPT_BASE = 'https://chatgpt.com';
const COOKIE_NAME = '__Secure-next-auth.session-token';
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ── API Request Recorder ──
// Captures network requests to chatgpt.com and claude.ai when recording is enabled.
let recording = false;
const MAX_RECORDINGS = 200;

// Temporary map to hold headers until onBeforeRequest fires
const pending_headers = new Map();

function on_before_send_headers(details) {
  if (!recording) return;
  // Store headers keyed by requestId for merge in on_before_request
  const headers = {};
  for (const h of details.requestHeaders || []) {
    headers[h.name] = h.value;
  }
  pending_headers.set(details.requestId, headers);
  // Clean up stale entries after 5s
  setTimeout(() => pending_headers.delete(details.requestId), 5000);
}

function on_before_request(details) {
  if (!recording) return;

  // Parse requestBody if available
  let body = null;
  if (details.requestBody) {
    if (details.requestBody.raw && details.requestBody.raw.length > 0) {
      try {
        const decoder = new TextDecoder();
        const bytes = details.requestBody.raw[0].bytes;
        if (bytes) {
          body = decoder.decode(bytes);
          // Try to parse as JSON for readability
          try { body = JSON.parse(body); } catch { /* keep as string */ }
        }
      } catch { /* ignore decode errors */ }
    } else if (details.requestBody.formData) {
      body = details.requestBody.formData;
    }
  }

  // Merge captured headers if available
  const headers = pending_headers.get(details.requestId) || null;
  pending_headers.delete(details.requestId);

  const entry = {
    timestamp: new Date().toISOString(),
    method: details.method,
    url: details.url,
    type: details.type,
    body,
    headers,
  };

  // Store in chrome.storage.local
  chrome.storage.local.get({ recorded_requests: [] }, (result) => {
    const recordings = result.recorded_requests;
    recordings.push(entry);
    // Keep only last MAX_RECORDINGS entries
    if (recordings.length > MAX_RECORDINGS) {
      recordings.splice(0, recordings.length - MAX_RECORDINGS);
    }
    chrome.storage.local.set({ recorded_requests: recordings });
  });
}

const REQUEST_FILTER = {
  urls: ['https://chatgpt.com/*', 'https://claude.ai/*', 'https://*.anthropic.com/*'],
  types: ['xmlhttprequest'],
};

// Register webRequest listeners
chrome.webRequest.onBeforeSendHeaders.addListener(
  on_before_send_headers,
  REQUEST_FILTER,
  ['requestHeaders'],
);

chrome.webRequest.onBeforeRequest.addListener(
  on_before_request,
  REQUEST_FILTER,
  ['requestBody'],
);

// Open dashboard directly when toolbar icon is clicked (no popup)
chrome.action.onClicked.addListener(async () => {
  const dashboardUrl = chrome.runtime.getURL('dist/dashboard/index.html');
  // Reuse existing dashboard tab if open
  const tabs = await chrome.tabs.query({ url: dashboardUrl });
  if (tabs.length > 0) {
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

function handle_check_chatgpt_login(_msg, sendResponse) {
  chrome.cookies.get(
    { url: CHATGPT_BASE, name: COOKIE_NAME },
    (cookie) => {
      sendResponse({ loggedIn: !!cookie });
    },
  );
  return true;
}

function handle_get_access_token(_msg, sendResponse) {
  chrome.cookies.get(
    { url: CHATGPT_BASE, name: COOKIE_NAME },
    async (cookie) => {
      if (!cookie) {
        sendResponse({ error: 'Not logged into ChatGPT. Please log in at chatgpt.com first.' });
        return;
      }
      try {
        const res = await fetch(`${CHATGPT_BASE}/api/auth/session`, {
          headers: {
            Cookie: `${COOKIE_NAME}=${cookie.value}`,
            'User-Agent': UA,
          },
        });
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
      } catch (err) {
        sendResponse({ error: err.message || String(err) });
      }
    },
  );
  return true;
}

function handle_check_claude_login(_msg, sendResponse) {
  chrome.cookies.get(
    { url: 'https://claude.ai', name: 'sessionKey' },
    (cookie) => {
      sendResponse({ loggedIn: !!cookie });
    },
  );
  return true;
}

function handle_get_claude_session(_msg, sendResponse) {
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

function handle_open_dashboard(_msg, sendResponse) {
  chrome.tabs.create({ url: chrome.runtime.getURL('dist/dashboard/index.html') });
  sendResponse({ success: true });
  return false;
}

function handle_api_proxy(msg, sendResponse) {
  (async () => {
    try {
      // Extract domain from URL for cookie scope
      const url = new URL(msg.url);
      const domain = url.hostname;

      // Security: only proxy to allowed domains
      const ALLOWED_DOMAINS = ['chatgpt.com', 'claude.ai', 'anthropic.com'];
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
      const seen = new Set();
      const deduped = allCookies.filter((c) => {
        const key = `${c.name}=${c.value}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const cookieStr = deduped.map((c) => `${c.name}=${c.value}`).join('; ');

      const headers = {
        ...(msg.headers || {}),
        Cookie: cookieStr,
        Origin: url.origin,
        Referer: `${url.origin}/`,
      };

      const options = {
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
      } else {
        const text = await response.text();
        sendResponse({ ok: true, status: response.status, data: text });
      }
    } catch (err) {
      sendResponse({ error: err.message || String(err), status: 0 });
    }
  })();
  return true;
}

function handle_start_recording(_msg, sendResponse) {
  recording = true;
  chrome.storage.local.set({ recorded_requests: [] });
  sendResponse({ ok: true });
  return false;
}

function handle_stop_recording(_msg, sendResponse) {
  recording = false;
  sendResponse({ ok: true });
  return false;
}

function handle_get_recording_state(_msg, sendResponse) {
  chrome.storage.local.get({ recorded_requests: [] }, (result) => {
    sendResponse({ recording, count: result.recorded_requests.length });
  });
  return true;
}

function handle_get_recordings(_msg, sendResponse) {
  chrome.storage.local.get({ recorded_requests: [] }, (result) => {
    sendResponse({ recordings: result.recorded_requests });
  });
  return true;
}

function handle_clear_recordings(_msg, sendResponse) {
  chrome.storage.local.set({ recorded_requests: [] });
  sendResponse({ ok: true });
  return false;
}

// ── Dispatch Map ──
// Maps action names to handler functions for clean routing.

const handlers = {
  'check-chatgpt-login': handle_check_chatgpt_login,
  'get-access-token': handle_get_access_token,
  'check-claude-login': handle_check_claude_login,
  'get-claude-session': handle_get_claude_session,
  'open-dashboard': handle_open_dashboard,
  'api-proxy': handle_api_proxy,
  'start-recording': handle_start_recording,
  'stop-recording': handle_stop_recording,
  'get-recording-state': handle_get_recording_state,
  'get-recordings': handle_get_recordings,
  'clear-recordings': handle_clear_recordings,
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg.action];
  if (handler) return handler(msg, sendResponse);
});
