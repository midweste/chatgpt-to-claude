/**
 * Unit tests for ChatGPTSource adapter.
 *
 * Tests the class methods by mocking chrome.runtime.sendMessage and
 * the IndexedDB storage helpers.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock storage module (still needed for other storage functions)
vi.mock('../storage', () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  removeSetting: vi.fn(),
}))

// Setup chrome mock
const sendMessage = vi.fn()
const storageLocal = {
  get: vi.fn().mockResolvedValue({}),
  set: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
}
vi.stubGlobal('chrome', {
  runtime: { sendMessage },
  cookies: { get: vi.fn() },
  storage: { local: storageLocal },
})

import { ChatGPTSource } from '../../lib/sources/chatgpt'

describe('ChatGPTSource', () => {
  let source: ChatGPTSource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new ChatGPTSource()
    storageLocal.get.mockResolvedValue({})
    storageLocal.set.mockResolvedValue(undefined)
    storageLocal.remove.mockResolvedValue(undefined)
  })

  // Helper to authenticate source for tests that need it
  async function authenticateSource(): Promise<void> {
    sendMessage.mockImplementation((_msg: unknown, cb: (r: unknown) => void) => {
      cb({ accessToken: 'test-token' })
    })
    await source.authenticate()
    sendMessage.mockReset()
  }

  describe('isAuthenticated', () => {
    it('returns false before authenticate', () => {
      expect(source.isAuthenticated).toBe(false)
    })

    it('returns true after authenticate', async () => {
      await authenticateSource()
      expect(source.isAuthenticated).toBe(true)
    })
  })

  describe('authenticate', () => {
    it('sets access token on success', async () => {
      sendMessage.mockImplementation((_msg: unknown, cb: (r: unknown) => void) => {
        cb({ accessToken: 'my-token' })
      })
      await source.authenticate()
      expect(source.isAuthenticated).toBe(true)
      expect(storageLocal.set).toHaveBeenCalledWith({ chatgpt_access_token: 'my-token' })
    })

    it('throws on error response', async () => {
      sendMessage.mockImplementation((_msg: unknown, cb: (r: unknown) => void) => {
        cb({ error: 'Cookie expired' })
      })
      await expect(source.authenticate()).rejects.toThrow('Cookie expired')
    })

    it('throws when no accessToken returned', async () => {
      sendMessage.mockImplementation((_msg: unknown, cb: (r: unknown) => void) => {
        cb({})
      })
      await expect(source.authenticate()).rejects.toThrow('No accessToken returned')
    })
  })

  describe('restoreSession', () => {
    it('returns false when no saved token', async () => {
      storageLocal.get.mockResolvedValue({})
      expect(await source.restoreSession()).toBe(false)
    })

    it('returns true when saved token is valid', async () => {
      storageLocal.get.mockResolvedValue({ chatgpt_access_token: 'saved-token' })
      sendMessage.mockResolvedValue({ data: { id: 'user-123' } })
      expect(await source.restoreSession()).toBe(true)
      expect(source.isAuthenticated).toBe(true)
    })

    it('returns false and clears token when validation fails', async () => {
      storageLocal.get.mockResolvedValue({ chatgpt_access_token: 'bad-token' })
      sendMessage.mockResolvedValue({ error: 'Unauthorized', status: 401 })
      expect(await source.restoreSession()).toBe(false)
      expect(storageLocal.remove).toHaveBeenCalledWith('chatgpt_access_token')
    })
  })

  describe('getConversation', () => {
    it('returns a raw conversation object with id normalized', async () => {
      await authenticateSource()
      sendMessage.mockResolvedValue({
        data: {
          conversation_id: 'conv-1',
          title: 'Test Conv',
          create_time: 1700000000,
          update_time: 1700100000,
          default_model_slug: 'gpt-4',
          mapping: { node1: {}, node2: {} },
          is_archived: false,
        },
      })

      const conv = await source.getConversation('conv-1')
      expect(conv.id).toBe('conv-1')
      expect(conv.title).toBe('Test Conv')
      expect(conv.default_model_slug).toBe('gpt-4')
      expect(conv.mapping).toEqual({ node1: {}, node2: {} })
      expect(conv.create_time).toBe(1700000000)
    })

    it('preserves all raw fields from API response', async () => {
      await authenticateSource()
      sendMessage.mockResolvedValue({
        data: {
          id: 'conv-2',
          title: 'No Slug',
          mapping: {
            n1: { message: { metadata: { model_slug: 'gpt-4-turbo' } } },
          },
        },
      })

      const conv = await source.getConversation('conv-2')
      expect(conv.id).toBe('conv-2')
      // Raw object preserves mapping structure for wrapper classes to interpret
      const mapping = conv.mapping as Record<string, Record<string, unknown>>
      expect(mapping.n1.message).toEqual({ metadata: { model_slug: 'gpt-4-turbo' } })
    })

    it('handles missing mapping', async () => {
      await authenticateSource()
      sendMessage.mockResolvedValue({
        data: { id: 'conv-3', title: 'Bare' },
      })

      const conv = await source.getConversation('conv-3')
      expect(conv.id).toBe('conv-3')
      expect(conv.mapping).toBeUndefined()
    })
  })

  describe('listConversations', () => {
    it('yields paginated conversation summaries', async () => {
      vi.useFakeTimers()
      await authenticateSource()
      sendMessage
        .mockResolvedValueOnce({
          data: {
            items: [
              { id: 'c1', title: 'Conv 1', create_time: 1700000000, update_time: 1700100000, default_model_slug: 'gpt-4' },
              { id: 'c2', title: 'Conv 2', create_time: '2024-01-01', is_archived: true },
            ],
            total: 3,
          },
        })
        .mockResolvedValueOnce({
          data: {
            items: [{ id: 'c3', title: null, create_time: null }],
            total: 3,
          },
        })

      const pages: Array<Array<Record<string, unknown>>> = []
      const progressCalls: Array<[number, number]> = []

      const gen = source.listConversations((loaded, total) => progressCalls.push([loaded, total]))
      const p1 = gen.next()
      await vi.advanceTimersByTimeAsync(1000)
      const r1 = await p1
      pages.push(r1.value as Array<Record<string, unknown>>)

      const p2 = gen.next()
      await vi.advanceTimersByTimeAsync(1000)
      const r2 = await p2
      pages.push(r2.value as Array<Record<string, unknown>>)

      expect(pages[0]).toHaveLength(2)
      expect(pages[0][0].id).toBe('c1')
      expect(pages[1]).toHaveLength(1)
      // Raw objects preserve null title as-is — wrapper classes handle 'Untitled' normalization
      expect(pages[1][0].title).toBeNull()
      expect(progressCalls.length).toBeGreaterThanOrEqual(1)
      vi.useRealTimers()
    })

    it('yields single page when total equals items', async () => {
      await authenticateSource()
      sendMessage.mockResolvedValue({
        data: {
          items: [{ id: 'c1', title: 'Only' }],
          total: 1,
        },
      })

      const pages = []
      for await (const page of source.listConversations()) {
        pages.push(page)
      }
      expect(pages).toHaveLength(1)
    })
  })

  describe('downloadAll', () => {
    it('downloads conversations in batched waves', async () => {
      vi.useFakeTimers()
      await authenticateSource()
      // Mock the batch endpoint — returns raw conversation objects
      sendMessage.mockResolvedValue({
        data: [
          { id: 'c1', title: 'Chat 1', mapping: { n1: {} } },
        ],
      })

      const progressCalls: Array<[number, number]> = []
      const promise = source.downloadAll(
        ['c1'],
        (downloaded, total) => progressCalls.push([downloaded, total]),
      )
      await vi.advanceTimersByTimeAsync(5000)
      const results = await promise

      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('c1')
      // Raw object — mapping preserved as-is
      const mapping = results[0].mapping as Record<string, unknown>
      expect(Object.keys(mapping)).toHaveLength(1)
      expect(progressCalls.length).toBeGreaterThan(0)
      vi.useRealTimers()
    })

    it('returns empty array for empty id list', async () => {
      await authenticateSource()
      const results = await source.downloadAll([])
      expect(results).toEqual([])
    })
  })

  describe('getProjects', () => {
    it('parses projects from gizmos sidebar', async () => {
      await authenticateSource()
      sendMessage
        .mockResolvedValueOnce({
          data: {
            items: [
              {
                gizmo: {
                  gizmo: {
                    id: 'g-p-abc',
                    display: { name: 'My Project' },
                    created_at: '2024-01-01',
                    updated_at: '2024-06-01',
                  },
                },
              },
              {
                // non-project gizmo (no g-p- prefix) — should be skipped
                gizmo: { gizmo: { id: 'g-123', display: { name: 'Custom GPT' } } },
              },
            ],
          },
        })
        // Second call: fetch conversations for the project
        .mockResolvedValueOnce({
          data: {
            items: [{ id: 'conv-in-proj' }],
          },
        })

      const projects = await source.getProjects()
      expect(projects).toHaveLength(1)
      expect(projects[0].id).toBe('g-p-abc')
      expect(projects[0].name).toBe('My Project')
      expect(projects[0].conversation_ids).toEqual(['conv-in-proj'])
    })

    it('returns empty array on API error', async () => {
      await authenticateSource()
      sendMessage.mockResolvedValue({ error: 'Server error', status: 500 })
      const projects = await source.getProjects()
      expect(projects).toEqual([])
    }, 30000)

    it('handles projects with no conversations', async () => {
      await authenticateSource()
      sendMessage
        .mockResolvedValueOnce({
          data: {
            items: [{
              gizmo: { gizmo: { id: 'g-p-empty', display: { name: 'Empty' } } },
            }],
          },
        })
        .mockResolvedValueOnce({ data: { items: [] } })

      const projects = await source.getProjects()
      expect(projects[0].conversation_ids).toEqual([])
    })

    it('handles conversation fetch error for a project', async () => {
      await authenticateSource()
      sendMessage
        .mockResolvedValueOnce({
          data: {
            items: [{
              gizmo: { gizmo: { id: 'g-p-err', display: { name: 'Broken' } } },
            }],
          },
        })
        .mockResolvedValueOnce({ error: 'Not found', status: 404 })

      const projects = await source.getProjects()
      expect(projects).toHaveLength(1)
      expect(projects[0].conversation_ids).toEqual([])
    }, 30000)
  })

  describe('getInstructions — fallback path', () => {
    it('falls back to settings/user when user_system_messages fails', async () => {
      await authenticateSource()
      sendMessage
        .mockResolvedValueOnce({ error: 'Not found', status: 404 }) // user_system_messages fails
        .mockResolvedValue({
          data: { about_user_message: 'Fallback user', about_model_message: 'Fallback model' },
        })

      const instructions = await source.getInstructions()
      // Raw object — property names match the API response
      expect(instructions?.about_user_message).toBe('Fallback user')
      expect(instructions?.about_model_message).toBe('Fallback model')
    }, 30000)

    it('returns null when both endpoints fail', async () => {
      await authenticateSource()
      sendMessage
        .mockResolvedValueOnce({ error: 'Not found', status: 404 })
        .mockResolvedValue({ error: 'Internal error', status: 500 })

      const instructions = await source.getInstructions()
      expect(instructions).toBeNull()
    }, 30000)
  })

  describe('getMemories', () => {
    it('returns memories from API', async () => {
      await authenticateSource()
      sendMessage.mockResolvedValue({
        data: {
          memories: [
            { id: 'mem-1', content: 'User likes TypeScript' },
            { id: 'mem-2', content: 'User prefers dark mode' },
          ],
        },
      })

      const memories = await source.getMemories()
      expect(memories).toHaveLength(2)
      expect(memories[0].id).toBe('mem-1')
      expect(memories[1].content).toBe('User prefers dark mode')
    })

    it('handles results field in response', async () => {
      await authenticateSource()
      sendMessage.mockResolvedValue({
        data: {
          results: [
            { id: 'mem-3', content: 'Alternative format' },
          ],
        },
      })

      const memories = await source.getMemories()
      expect(memories).toHaveLength(1)
    })

    it('returns empty array on API error', async () => {
      await authenticateSource()
      sendMessage.mockResolvedValue({ error: 'Server error', status: 500 })

      const memories = await source.getMemories()
      expect(memories).toEqual([])
    }, 30000)
  })

  describe('sendConversationMessage', () => {
    it('delegates to sendMessage helper', async () => {
      await authenticateSource()
      // sendConversationMessage uses a different code path (chatgpt-messaging)
      // We just verify it doesn't throw and returns a string
      sendMessage.mockResolvedValue({
        data: 'event: message\ndata: {"message":{"content":{"parts":["Hello!"]}}}',
      })

      // This may throw if chatgpt-messaging has more complex requirements,
      // but the basic path should work
      const result = await source.sendConversationMessage('Hello')
      expect(typeof result).toBe('string')
    })
  })

  describe('downloadBatch fallback', () => {
    it('falls back to individual downloads when batch endpoint fails', async () => {
      vi.useFakeTimers()
      await authenticateSource()
      sendMessage
        // First call: batch endpoint fails
        .mockResolvedValueOnce({ error: 'Method not allowed', status: 405 })
        // Fallback: individual downloads
        .mockResolvedValueOnce({ data: { id: 'c1', title: 'Conv 1', mapping: {} } })

      const promise = source.downloadAll(['c1'])
      await vi.advanceTimersByTimeAsync(5000)
      const results = await promise

      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('c1')
      vi.useRealTimers()
    }, 15000)
  })

  describe('request retry logic', () => {
    it('throws not authenticated if no token', async () => {
      await expect(source.getConversation('x')).rejects.toThrow('Not authenticated')
    })

    it('retries on 429 rate limit', async () => {
      vi.useFakeTimers()
      await authenticateSource()
      sendMessage
        .mockResolvedValueOnce({ status: 429, error: 'Rate limited' })
        .mockResolvedValue({ data: { id: 'c1', title: 'Retry OK' } })

      const promise = source.getConversation('c1')
      // Advance past RETRY_DELAY_MS (30s) + BATCH_DELAY_MS (500ms)
      await vi.advanceTimersByTimeAsync(35_000)
      const conv = await promise
      expect(conv.title).toBe('Retry OK')
      // 1 (429 response) + 1 (success) = 2 calls for getConversation
      // (authenticate calls are cleared by mockReset in authenticateSource)
      expect(sendMessage).toHaveBeenCalledTimes(2)
      vi.useRealTimers()
    }, 15000)

    it('throws on non-retryable 4xx errors', async () => {
      await authenticateSource()
      sendMessage.mockResolvedValue({ status: 404, error: 'Not found' })

      await expect(source.getConversation('missing')).rejects.toThrow('HTTP 404')
    }, 15000)
  })
})
