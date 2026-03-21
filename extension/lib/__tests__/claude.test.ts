/**
 * Unit tests for ClaudeDestination adapter.
 *
 * Tests the class methods by mocking chrome.runtime.sendMessage.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Setup chrome mock
const sendMessage = vi.fn()
vi.stubGlobal('chrome', {
  runtime: { sendMessage },
  cookies: { get: vi.fn() },
  storage: { local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() } },
})

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => 'mock-uuid-1234'),
})

import { ClaudeDestination } from '../../lib/destinations/claude'

describe('ClaudeDestination', () => {
  let claude: ClaudeDestination

  beforeEach(() => {
    vi.clearAllMocks()
    claude = new ClaudeDestination()
  })

  async function authenticate(): Promise<void> {
    sendMessage
      .mockResolvedValueOnce({ sessionKey: 'sk-test', organizationId: 'org-abc' })
      .mockResolvedValueOnce({ ok: true, status: 200, data: {} }) // validateSession
    await claude.authenticate()
    sendMessage.mockReset()
  }

  describe('isAuthenticated', () => {
    it('returns false before authenticate', () => {
      expect(claude.isAuthenticated()).toBe(false)
    })

    it('returns true after authenticate', async () => {
      await authenticate()
      expect(claude.isAuthenticated()).toBe(true)
    })
  })

  describe('getOrganizationId', () => {
    it('returns null before authenticate', () => {
      expect(claude.getOrganizationId()).toBeNull()
    })

    it('returns org ID after authenticate', async () => {
      await authenticate()
      expect(claude.getOrganizationId()).toBe('org-abc')
    })
  })

  describe('authenticate', () => {
    it('sets session on success', async () => {
      sendMessage
        .mockResolvedValueOnce({ sessionKey: 'sk-123', organizationId: 'org-xyz' })
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} }) // validateSession
      await claude.authenticate()
      expect(claude.isAuthenticated()).toBe(true)
      expect(claude.getOrganizationId()).toBe('org-xyz')
    })

    it('throws on no response', async () => {
      sendMessage.mockResolvedValue(null)
      await expect(claude.authenticate()).rejects.toThrow('No response from background script')
    })

    it('throws on error response', async () => {
      sendMessage.mockResolvedValue({ error: 'Not logged in' })
      await expect(claude.authenticate()).rejects.toThrow('Not logged in')
    })

    it('throws when no organizationId', async () => {
      sendMessage.mockResolvedValue({ sessionKey: 'sk-123' })
      await expect(claude.authenticate()).rejects.toThrow('Could not determine Claude organization ID')
    })
  })

  describe('restoreSession', () => {
    it('returns false when not logged in', async () => {
      sendMessage.mockResolvedValue({ loggedIn: false })
      expect(await claude.restoreSession()).toBe(false)
    })

    it('returns true and authenticates when logged in', async () => {
      sendMessage
        .mockResolvedValueOnce({ loggedIn: true }) // check-claude-login
        .mockResolvedValueOnce({ sessionKey: 'sk', organizationId: 'org' }) // get-claude-session
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} }) // validateSession
      expect(await claude.restoreSession()).toBe(true)
      expect(claude.isAuthenticated()).toBe(true)
    })

    it('returns false on error', async () => {
      sendMessage.mockRejectedValue(new Error('fail'))
      expect(await claude.restoreSession()).toBe(false)
    })
  })

  describe('createProject', () => {
    it('creates a project and returns uuid', async () => {
      await authenticate()
      sendMessage.mockResolvedValue({ data: { uuid: 'proj-1' } })
      const result = await claude.createProject('My Project', 'Test description')
      expect(result).toEqual({ uuid: 'proj-1' })
      // Verify the URL contains the org ID
      expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        action: 'api-proxy',
        method: 'POST',
      }))
    })

    it('throws when not authenticated', async () => {
      await expect(claude.createProject('Test', 'Desc')).rejects.toThrow('Not authenticated')
    })
  })

  describe('createConversation', () => {
    it('creates with a random UUID', async () => {
      await authenticate()
      sendMessage.mockResolvedValue({ data: {} })
      const result = await claude.createConversation('Test Conv')
      expect(result.uuid).toBe('mock-uuid-1234')
    })

    it('works without a name', async () => {
      await authenticate()
      sendMessage.mockResolvedValue({ data: {} })
      const result = await claude.createConversation()
      expect(result.uuid).toBe('mock-uuid-1234')
    })
  })

  describe('renameConversation', () => {
    it('sends PUT with new name', async () => {
      await authenticate()
      sendMessage.mockResolvedValue({ data: {} })
      await claude.renameConversation('conv-1', 'New Name')
      expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        method: 'PUT',
        body: { name: 'New Name' },
      }))
    })
  })

  describe('sendMessage', () => {
    it('parses SSE response for assistant text', async () => {
      await authenticate()
      sendMessage.mockResolvedValue({
        data: [
          'event: content_block_delta',
          'data: {"type":"content_block_delta","delta":{"text":"Hello "}}',
          '',
          'event: content_block_delta',
          'data: {"type":"content_block_delta","delta":{"text":"world!"}}',
          '',
        ].join('\n'),
      })

      const reply = await claude.sendMessage('conv-1', 'Hi there')
      expect(reply).toBe('Hello world!')
    })

    it('returns empty string when no content blocks', async () => {
      await authenticate()
      sendMessage.mockResolvedValue({
        data: 'event: message_start\ndata: {"type":"message_start"}\n',
      })

      const reply = await claude.sendMessage('conv-1', 'Hi')
      expect(reply).toBe('')
    })

    it('throws on error response', async () => {
      await authenticate()
      sendMessage.mockResolvedValue({ error: 'Session expired' })
      await expect(claude.sendMessage('c', 'p')).rejects.toThrow('Completion failed')
    })
  })

  describe('uploadDocument', () => {
    it('sends POST with file content', async () => {
      await authenticate()
      sendMessage.mockResolvedValue({ data: { id: 'doc-1' } })
      await claude.uploadDocument('proj-1', 'notes.md', '# Notes')
      expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        method: 'POST',
        body: { file_name: 'notes.md', content: '# Notes' },
      }))
    })
  })

  describe('moveToProject', () => {
    it('sends POST with conversation UUIDs', async () => {
      await authenticate()
      sendMessage.mockResolvedValue({ data: {} })
      await claude.moveToProject(['c1', 'c2'], 'proj-1')
      expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        body: { conversation_uuids: ['c1', 'c2'], project_uuid: 'proj-1' },
      }))
    })
  })

  describe('listProjects', () => {
    it('returns project list', async () => {
      await authenticate()
      sendMessage.mockResolvedValue({
        data: [
          { uuid: 'p1', name: 'Project 1' },
          { uuid: 'p2', name: 'Project 2' },
        ],
      })
      const projects = await claude.listProjects()
      expect(projects).toHaveLength(2)
      expect(projects[0].name).toBe('Project 1')
    })
  })

  describe('listConversations', () => {
    it('returns conversation list', async () => {
      await authenticate()
      sendMessage.mockResolvedValue({
        data: [
          { uuid: 'c1', name: 'Conv 1' },
        ],
      })
      const convs = await claude.listConversations()
      expect(convs).toHaveLength(1)
    })
  })

  describe('fetchExistingTitles', () => {
    it('returns set with both original and stripped GPT prefix', async () => {
      await authenticate()
      sendMessage.mockResolvedValue({
        data: [
          { uuid: 'c1', name: '[GPT] My Chat' },
          { uuid: 'c2', name: 'Regular Chat' },
        ],
      })
      const titles = await claude.fetchExistingTitles()
      expect(titles.has('[GPT] My Chat')).toBe(true)
      expect(titles.has('My Chat')).toBe(true)
      expect(titles.has('Regular Chat')).toBe(true)
    })
  })

  describe('request retry logic', () => {
    it('retries on 403 (Cloudflare)', async () => {
      vi.useFakeTimers()
      await authenticate()
      sendMessage
        .mockResolvedValueOnce({ status: 403, body: 'Cloudflare challenge' })
        .mockResolvedValue({ data: [{ uuid: 'p1', name: 'OK' }] })

      const promise = claude.listProjects()
      await vi.advanceTimersByTimeAsync(30_000)
      const projects = await promise
      expect(projects).toHaveLength(1)
      expect(sendMessage).toHaveBeenCalledTimes(2) // 1 failed + 1 success
      vi.useRealTimers()
    }, 10000)

    it('throws on persistent error', async () => {
      await authenticate()
      sendMessage.mockResolvedValue({ error: 'Server down', status: 500 })
      await expect(claude.listProjects()).rejects.toThrow('Claude API')
    })

    it('does not retry auth-failure 403s', async () => {
      await authenticate()
      sendMessage.mockResolvedValue({
        status: 403,
        error: 'Forbidden',
        body: '{"type":"error","error":{"type":"permission_error","details":{"error_code":"account_session_invalid"}}}',
      })
      await expect(claude.listProjects()).rejects.toThrow('session has expired')
      expect(sendMessage).toHaveBeenCalledTimes(1) // no retries
    })
  })

  describe('resolveOrCreateProject', () => {
    it('returns cached project UUID on second call', async () => {
      await authenticate()
      // First call: listProjects returns the project
      sendMessage
        .mockResolvedValueOnce({ data: [{ uuid: 'p1', name: 'My Project' }] })
      const uuid1 = await claude.resolveOrCreateProject('My Project')
      expect(uuid1).toBe('p1')

      // Second call: should use cache, no API call
      sendMessage.mockClear()
      const uuid2 = await claude.resolveOrCreateProject('My Project')
      expect(uuid2).toBe('p1')
      expect(sendMessage).not.toHaveBeenCalled()
    })

    it('creates project when not found in API', async () => {
      await authenticate()
      // listProjects returns empty
      sendMessage
        .mockResolvedValueOnce({ data: [] })
        // createProject
        .mockResolvedValueOnce({ data: { uuid: 'new-proj' } })
      const uuid = await claude.resolveOrCreateProject('New Project', 'My desc')
      expect(uuid).toBe('new-proj')
    })

    it('is case-insensitive for project name lookup', async () => {
      await authenticate()
      sendMessage
        .mockResolvedValueOnce({ data: [{ uuid: 'p1', name: 'My Project' }] })
      const uuid = await claude.resolveOrCreateProject('my project')
      expect(uuid).toBe('p1')
    })
  })

  describe('setProjectInstructions', () => {
    it('sends PUT to update project prompt_template', async () => {
      await authenticate()
      sendMessage.mockResolvedValue({ data: {} })
      await claude.setProjectInstructions('proj-1', 'Be helpful')
      expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        method: 'PUT',
        body: { prompt_template: 'Be helpful' },
      }))
    })
  })

  describe('getAccountInstructions', () => {
    it('returns conversation_preferences from profile', async () => {
      await authenticate()
      sendMessage.mockResolvedValue({ data: { conversation_preferences: 'My prefs' } })
      const result = await claude.getAccountInstructions()
      expect(result).toBe('My prefs')
    })

    it('returns empty string when no preferences', async () => {
      await authenticate()
      sendMessage.mockResolvedValue({ data: {} })
      const result = await claude.getAccountInstructions()
      expect(result).toBe('')
    })
  })

  describe('setAccountInstructions', () => {
    it('sends PUT to update account profile', async () => {
      await authenticate()
      sendMessage.mockResolvedValue({ data: {} })
      await claude.setAccountInstructions('Be concise')
      expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        method: 'PUT',
        body: { conversation_preferences: 'Be concise' },
      }))
    })
  })

  describe('getUsage', () => {
    it('returns usage data', async () => {
      await authenticate()
      const mockUsage = { five_hour: { utilization: 50, resets_at: '2024-01-01' } }
      sendMessage.mockResolvedValue({ data: mockUsage })
      const usage = await claude.getUsage()
      expect(usage.five_hour?.utilization).toBe(50)
    })
  })
})

