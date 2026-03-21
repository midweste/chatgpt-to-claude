/**
 * ChatGPT messaging — send prompts and receive responses via ephemeral conversations.
 *
 * Extracted from ChatGPTSource to separate the "conversation AI" concern
 * from the "data extraction" concern.
 */

import { CHATGPT_BASE } from '../constants/chatgpt';
import { parseSSEResponse } from '../utils/sse-parser';
import { logger } from '../services/logger';

/**
 * Send a prompt to ChatGPT and return the assistant's response text.
 *
 * Creates a new ephemeral conversation via the internal conversation API.
 * The response is an SSE stream which is parsed to extract the final message.
 */
export async function sendConversationMessage(
  prompt: string,
  headers: Record<string, string>,
  getDeviceId: () => Promise<string>,
): Promise<string> {
  const deviceId = await getDeviceId();
  const messageId = crypto.randomUUID();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzOffset = new Date().getTimezoneOffset();

  // Step 1: Call prepare with a partial_query preview of the message.
  // Returns a conduit_token JWT needed for the conversation POST.
  const prepareBody = {
    action: 'next',
    fork_from_shared_post: false,
    parent_message_id: 'client-created-root',
    model: 'auto',
    timezone_offset_min: tzOffset,
    timezone: tz,
    conversation_mode: { kind: 'primary_assistant' },
    system_hints: [],
    partial_query: {
      id: messageId,
      author: { role: 'user' },
      content: { content_type: 'text', parts: [prompt] },
    },
    supports_buffering: true,
    supported_encodings: ['v1'],
    client_contextual_info: { app_name: 'chatgpt.com' },
  };

  const prepareResult = await chrome.runtime.sendMessage({
    action: 'api-proxy',
    url: `${CHATGPT_BASE}/backend-api/f/conversation/prepare`,
    method: 'POST',
    headers: {
      ...headers,
      'oai-device-id': deviceId,
      'oai-language': 'en-US',
    },
    body: prepareBody,
  });

  if (prepareResult.error) {
    await logger.error('ChatGPT', `Prepare failed: ${JSON.stringify(prepareResult)}`);
    throw new Error(`Prepare failed: HTTP ${prepareResult.status} — ${prepareResult.body || prepareResult.error}`);
  }

  const conduitToken = prepareResult.data?.conduit_token;
  await logger.debug('ChatGPT', `Got conduit_token: ${conduitToken ? 'yes' : 'no'}`);

  // Step 2: Send conversation with conduit token
  const body = {
    action: 'next',
    messages: [{
      id: messageId,
      author: { role: 'user' },
      content: { content_type: 'text', parts: [prompt] },
      create_time: Date.now() / 1000,
      metadata: {
        serialization_metadata: { custom_symbol_offsets: [] },
      },
    }],
    parent_message_id: 'client-created-root',
    model: 'auto',
    conversation_mode: { kind: 'primary_assistant' },
    force_parallel_switch: 'auto',
    supported_encodings: ['v1'],
    supports_buffering: true,
    system_hints: [],
    timezone: tz,
    timezone_offset_min: tzOffset,
  };

  const conversationHeaders: Record<string, string> = {
    ...headers,
    Accept: 'text/event-stream',
    'oai-device-id': deviceId,
    'oai-language': 'en-US',
  };

  if (conduitToken) {
    conversationHeaders['openai-sentinel-chat-requirements-token'] = conduitToken;
  }

  const result = await chrome.runtime.sendMessage({
    action: 'api-proxy',
    url: `${CHATGPT_BASE}/backend-api/f/conversation`,
    method: 'POST',
    headers: conversationHeaders,
    body,
  });

  if (result.error) {
    await logger.error('ChatGPT', `Conversation API error: ${JSON.stringify(result)}`);
    throw new Error(`Conversation API failed: HTTP ${result.status} — ${result.body || result.error}`);
  }

  return parseSSEResponse(result.data as string);
}
