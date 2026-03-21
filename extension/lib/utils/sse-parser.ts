/**
 * SSE response parser for ChatGPT conversation streams.
 *
 * Extracts the assistant's final message text from a ChatGPT SSE response.
 * The response is a series of `data: {...}` lines — we walk backward to find
 * the last event containing message content.
 */

export function parseSSEResponse(raw: string): string {
  const lines = raw.split('\n');

  // Walk backward to find the last data line with message content
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith('data: ')) continue;
    if (line === 'data: [DONE]') continue;

    try {
      const data = JSON.parse(line.slice(6));
      const parts = data?.message?.content?.parts;
      if (Array.isArray(parts) && parts.length > 0 && typeof parts[0] === 'string' && parts[0].trim()) {
        return parts.join('\n');
      }
    } catch {
      // Skip unparseable lines
    }
  }

  throw new Error('Could not extract response from ChatGPT — no message content found in SSE stream');
}

/**
 * Parse a Claude SSE response to extract the assistant's message text.
 *
 * Claude's SSE format uses `content_block_delta` events with `delta.text` fields.
 * We concatenate all text deltas in order.
 */
export function parseClaudeSSE(raw: string): string {
  const lines = raw.split('\n');
  let text = '';

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    try {
      const data = JSON.parse(line.slice(6));
      if (data.type === 'content_block_delta' && data.delta?.text) {
        text += data.delta.text;
      }
    } catch {
      // Skip non-JSON lines (e.g. "data: [DONE]")
    }
  }

  return text;
}
