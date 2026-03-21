/**
 * Unit tests for chatgpt-messaging.ts — the ephemeral conversation flow.
 *
 * Tests the three main flows:
 * 1. Normal completion: prepare + conversation → parsed SSE response
 * 2. Conduit token exchange: prepare returns a token that's forwarded
 * 3. Error handling: prepare error, conversation error
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock logger
vi.mock('../services/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock SSE parser
vi.mock('../utils/sse-parser', () => ({
  parseSSEResponse: vi.fn(),
}))

// Setup chrome mock
const sendMessage = vi.fn()
vi.stubGlobal('chrome', {
  runtime: { sendMessage },
  storage: { local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() } },
  cookies: { get: vi.fn() },
})

// Stub crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-1234' })

import { sendConversationMessage } from '../sources/chatgpt-messaging'
import { parseSSEResponse } from '../utils/sse-parser'

describe('sendConversationMessage', () => {
  const headers = { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' }
  const getDeviceId = vi.fn().mockResolvedValue('device-123')

  beforeEach(() => {
    vi.clearAllMocks()
    getDeviceId.mockResolvedValue('device-123')
  })

  it('sends prepare + conversation and returns parsed response', async () => {
    // Prepare returns a conduit token
    sendMessage
      .mockResolvedValueOnce({ ok: true, data: { conduit_token: 'jwt-abc' } })
      .mockResolvedValueOnce({ ok: true, data: 'data: {"message":{"content":{"parts":["Hello!"]}}}\n\ndata: [DONE]' })

    vi.mocked(parseSSEResponse).mockReturnValue('Hello!')

    const result = await sendConversationMessage('Say hello', headers, getDeviceId)

    expect(result).toBe('Hello!')
    expect(getDeviceId).toHaveBeenCalledOnce()

    // Verify prepare call
    const prepareCall = sendMessage.mock.calls[0][0]
    expect(prepareCall.action).toBe('api-proxy')
    expect(prepareCall.url).toContain('/backend-api/f/conversation/prepare')
    expect(prepareCall.method).toBe('POST')
    expect(prepareCall.headers['oai-device-id']).toBe('device-123')
    expect(prepareCall.body.partial_query.id).toBe('test-uuid-1234')

    // Verify conversation call includes conduit token
    const convCall = sendMessage.mock.calls[1][0]
    expect(convCall.action).toBe('api-proxy')
    expect(convCall.url).toContain('/backend-api/f/conversation')
    expect(convCall.headers['openai-sentinel-chat-requirements-token']).toBe('jwt-abc')
    expect(convCall.headers.Accept).toBe('text/event-stream')
  })

  it('works without conduit token', async () => {
    // Prepare returns no conduit token
    sendMessage
      .mockResolvedValueOnce({ ok: true, data: {} })
      .mockResolvedValueOnce({ ok: true, data: 'data: {"message":{"content":{"parts":["No token"]}}}\n' })

    vi.mocked(parseSSEResponse).mockReturnValue('No token')

    const result = await sendConversationMessage('Test', headers, getDeviceId)

    expect(result).toBe('No token')

    // Conversation call should NOT include the conduit token header
    const convCall = sendMessage.mock.calls[1][0]
    expect(convCall.headers['openai-sentinel-chat-requirements-token']).toBeUndefined()
  })

  it('throws on prepare error', async () => {
    sendMessage.mockResolvedValueOnce({
      error: 'Server error',
      status: 500,
      body: 'Internal Server Error',
    })

    await expect(
      sendConversationMessage('Fail', headers, getDeviceId),
    ).rejects.toThrow('Prepare failed')

    // Should not proceed to conversation call
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })

  it('throws on conversation API error', async () => {
    sendMessage
      .mockResolvedValueOnce({ ok: true, data: { conduit_token: 'tok' } })
      .mockResolvedValueOnce({ error: 'Rate limited', status: 429, body: 'Too many requests' })

    await expect(
      sendConversationMessage('Fail', headers, getDeviceId),
    ).rejects.toThrow('Conversation API failed')
  })

  it('passes prompt text in both prepare and conversation bodies', async () => {
    sendMessage
      .mockResolvedValueOnce({ ok: true, data: {} })
      .mockResolvedValueOnce({ ok: true, data: 'sse-data' })

    vi.mocked(parseSSEResponse).mockReturnValue('response')

    await sendConversationMessage('My specific prompt', headers, getDeviceId)

    // Prepare body should include partial_query with prompt
    const prepareBody = sendMessage.mock.calls[0][0].body
    expect(prepareBody.partial_query.content.parts).toEqual(['My specific prompt'])

    // Conversation body should include full message with prompt
    const convBody = sendMessage.mock.calls[1][0].body
    expect(convBody.messages[0].content.parts).toEqual(['My specific prompt'])
    expect(convBody.messages[0].id).toBe('test-uuid-1234')
  })

  it('forwards auth headers and adds oai headers', async () => {
    sendMessage
      .mockResolvedValueOnce({ ok: true, data: {} })
      .mockResolvedValueOnce({ ok: true, data: 'sse' })

    vi.mocked(parseSSEResponse).mockReturnValue('ok')

    await sendConversationMessage('Test', headers, getDeviceId)

    const prepareHeaders = sendMessage.mock.calls[0][0].headers
    expect(prepareHeaders.Authorization).toBe('Bearer test-token')
    expect(prepareHeaders['oai-device-id']).toBe('device-123')
    expect(prepareHeaders['oai-language']).toBe('en-US')
  })
})
