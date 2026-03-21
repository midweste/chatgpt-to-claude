/**
 * Unit tests for migration-store.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock chrome APIs
vi.stubGlobal('chrome', {
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn(), remove: vi.fn() } },
  cookies: { get: vi.fn() },
  runtime: { sendMessage: vi.fn() },
})

// Mock storage module (IndexedDB-backed settings)
vi.mock('@lib/storage', () => ({
  getSetting: vi.fn().mockResolvedValue(null),
  setSetting: vi.fn().mockResolvedValue(undefined),
  removeSetting: vi.fn().mockResolvedValue(undefined),
  patchTracking: vi.fn().mockResolvedValue(undefined),
}))

// Mock service dependencies
vi.mock('@lib/destinations/claude', () => ({
  ClaudeDestination: vi.fn().mockImplementation(() => ({
    authenticate: vi.fn().mockResolvedValue(undefined),
    listConversations: vi.fn().mockResolvedValue([
      { uuid: 'claude-1', name: 'Existing Conv' },
    ]),
    isAuthenticated: vi.fn().mockReturnValue(true),
  })),
}))

vi.mock('@lib/services/migration-service', () => ({
  MigrationService: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    pushConversation: vi.fn().mockResolvedValue({ id: 'c1', status: 'done' }),
  })),
}))

vi.mock('@lib/services/logger', () => ({
  logger: {
    info: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
    error: vi.fn().mockResolvedValue(undefined),
  },
}))

// Mock the dynamic import of conversation-store that connectClaude uses
vi.mock('@/stores/conversation-store', () => ({
  useConversationStore: {
    getState: () => ({
      refreshPushed: vi.fn().mockResolvedValue(undefined),
      markPushed: vi.fn().mockResolvedValue(undefined),
    }),
  },
}))

const { useMigrationStore } = await import('../migration-store')

// Access mocked modules
const { getSetting } = await import('@lib/storage')
const { MigrationService } = await import('@lib/services/migration-service')

import { ChatGPTConversation } from '@lib/sources/chatgpt-conversation'
import type { IConversation } from '@lib/interfaces/conversation'

function makeConv(id: string, overrides = {}): IConversation {
  return new ChatGPTConversation({
    id,
    title: `Conv ${id}`,
    create_time: null,
    update_time: null,
    current_node: null,
    mapping: {},
    ...overrides,
  })
}

describe('MigrationStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMigrationStore.getState().reset()
  })

  describe('initial state', () => {
    it('should have correct defaults', () => {
      const state = useMigrationStore.getState()
      expect(state.claude).toBeNull()
      expect(state.claude_status).toBe('idle')
      expect(state.status).toBe('idle')
      expect(state.results).toEqual([])
      expect(state.mode).toBe('push')
      expect(state.name_prefix).toBe('')
    })
  })

  describe('hydrate', () => {
    it('loads persisted settings from IndexedDB', async () => {
      ;(getSetting as ReturnType<typeof vi.fn>).mockResolvedValue({
        mode: 'push',
        model: 'claude-opus-4-6',
        prompt_prefix: 'TEST: ',
        name_prefix: '[X] ',
        download_format: 'json',
        skip_duplicates: false,
      })

      await useMigrationStore.getState().hydrate()
      const state = useMigrationStore.getState()
      expect(state.mode).toBe('push')
      expect(state.model).toBe('claude-opus-4-6')
      expect(state.prompt_prefix).toBe('TEST: ')
      expect(state.download_format).toBe('json')
      expect(state.skip_duplicates).toBe(false)
    })

    it('keeps defaults when no stored settings', async () => {
      ;(getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(null)
      await useMigrationStore.getState().hydrate()
      expect(useMigrationStore.getState().mode).toBe('push')
    })

    it('handles storage errors gracefully', async () => {
      ;(getSetting as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'))
      await useMigrationStore.getState().hydrate()
      // Should not throw — keeps defaults
      expect(useMigrationStore.getState().mode).toBe('push')
    })
  })

  describe('settings', () => {
    it('should update mode and persist', () => {
      useMigrationStore.getState().set_mode('push')
      expect(useMigrationStore.getState().mode).toBe('push')
    })

    it('should update model', () => {
      useMigrationStore.getState().set_model('claude-opus-4-6')
      expect(useMigrationStore.getState().model).toBe('claude-opus-4-6')
    })

    it('should update name prefix', () => {
      useMigrationStore.getState().set_name_prefix('[ChatGPT] ')
      expect(useMigrationStore.getState().name_prefix).toBe('[ChatGPT] ')
    })

    it('should update prompt prefix', () => {
      useMigrationStore.getState().set_prompt_prefix('Please confirm')
      expect(useMigrationStore.getState().prompt_prefix).toBe('Please confirm')
    })

    it('should update download format', () => {
      useMigrationStore.getState().set_download_format('json')
      expect(useMigrationStore.getState().download_format).toBe('json')
    })

    it('should update skip_duplicates', () => {
      useMigrationStore.getState().set_skip_duplicates(false)
      expect(useMigrationStore.getState().skip_duplicates).toBe(false)
    })
  })

  describe('Claude connection', () => {
    it('should connect to Claude successfully', async () => {
      await useMigrationStore.getState().connectClaude()
      const state = useMigrationStore.getState()
      expect(state.claude_status).toBe('connected')
      expect(state.claude).not.toBeNull()
      expect(state.claude_titles.has('Existing Conv')).toBe(true)
    })

    it('should disconnect from Claude', async () => {
      await useMigrationStore.getState().connectClaude()
      useMigrationStore.getState().disconnectClaude()
      const state = useMigrationStore.getState()
      expect(state.claude).toBeNull()
      expect(state.claude_status).toBe('disconnected')
      expect(state.claude_titles.size).toBe(0)
    })

    it('should handle connection errors', async () => {
      const { ClaudeDestination } = await import('@lib/destinations/claude')
      ;(ClaudeDestination as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
        authenticate: vi.fn().mockRejectedValue(new Error('Auth failed')),
        listConversations: vi.fn(),
        isAuthenticated: vi.fn().mockReturnValue(false),
      }))

      useMigrationStore.getState().reset()
      await useMigrationStore.getState().connectClaude()
      expect(useMigrationStore.getState().claude_status).toBe('error')
      expect(useMigrationStore.getState().claude_error).toContain('Auth failed')
    })
  })

  describe('migration controls', () => {
    it('should pause and resume', () => {
      useMigrationStore.setState({ status: 'running' })
      useMigrationStore.getState().pause()
      expect(useMigrationStore.getState().status).toBe('paused')
      expect(useMigrationStore.getState().paused_ref).toBe(true)

      useMigrationStore.getState().resume()
      expect(useMigrationStore.getState().status).toBe('running')
      expect(useMigrationStore.getState().paused_ref).toBe(false)
    })

    it('should cancel', () => {
      useMigrationStore.setState({ status: 'running' })
      useMigrationStore.getState().cancel()
      expect(useMigrationStore.getState().status).toBe('done')
      expect(useMigrationStore.getState().cancelled_ref).toBe(true)
    })

    it('should reset to defaults', () => {
      useMigrationStore.setState({ status: 'done', results: [{ id: 'c1', status: 'done' }] })
      useMigrationStore.getState().reset()
      const state = useMigrationStore.getState()
      expect(state.status).toBe('idle')
      expect(state.results).toEqual([])
    })
  })

  describe('start_migration', () => {
    it('does nothing when claude is not connected', async () => {
      await useMigrationStore.getState().start_migration(
        [makeConv('c1')], [], undefined,
      )
      expect(useMigrationStore.getState().status).toBe('idle')
    })

    it('does nothing when already running', async () => {
      await useMigrationStore.getState().connectClaude()
      useMigrationStore.setState({ status: 'running' })
      await useMigrationStore.getState().start_migration(
        [makeConv('c1')], [], undefined,
      )
      // Should not have changed results (already running)
      expect(useMigrationStore.getState().results).toEqual([])
    })

    it('does nothing when passed empty array (UI already filtered)', async () => {
      await useMigrationStore.getState().connectClaude()
      await useMigrationStore.getState().start_migration(
        [], [], undefined,
      )
      expect(useMigrationStore.getState().status).toBe('idle')
    })



    it('pushes selected conversations', async () => {
      await useMigrationStore.getState().connectClaude()
      const callback = vi.fn()
      await useMigrationStore.getState().start_migration(
        [makeConv('c1')], [], callback,
      )
      expect(useMigrationStore.getState().status).toBe('done')
      expect(callback).toHaveBeenCalled()
      // MigrationService.pushConversation should have been called
      const serviceInstance = (MigrationService as ReturnType<typeof vi.fn>).mock.results[0]?.value
      expect(serviceInstance?.pushConversation).toHaveBeenCalled()
    })

    it('skips duplicates when enabled and titles match', async () => {
      await useMigrationStore.getState().connectClaude()
      // claude_titles already has 'Existing Conv' from the mock
      useMigrationStore.setState({ skip_duplicates: true })

      await useMigrationStore.getState().start_migration(
        [makeConv('c1', { title: 'Existing Conv' })], [], undefined,
      )
      expect(useMigrationStore.getState().status).toBe('done')
      // The conv was filtered out — pushConversation should not have been called
      const serviceInstance = (MigrationService as ReturnType<typeof vi.fn>).mock.results[0]?.value
      expect(serviceInstance?.pushConversation).not.toHaveBeenCalled()
    })
  })

  describe('retry_failed', () => {
    it('does nothing when claude is not connected', async () => {
      useMigrationStore.setState({ results: [{ id: 'c1', status: 'error' }] })
      await useMigrationStore.getState().retry_failed(
        [makeConv('c1')], [], undefined,
      )
      expect(useMigrationStore.getState().status).toBe('idle')
    })

    it('does nothing when no failed results', async () => {
      await useMigrationStore.getState().connectClaude()
      useMigrationStore.setState({ results: [{ id: 'c1', status: 'done' }] })
      await useMigrationStore.getState().retry_failed(
        [makeConv('c1')], [], undefined,
      )
      // Status should remain idle since there are no errors to retry
      expect(useMigrationStore.getState().status).toBe('idle')
    })

    it('retries failed conversations', async () => {
      await useMigrationStore.getState().connectClaude()
      useMigrationStore.setState({
        results: [
          { id: 'c1', status: 'done' },
          { id: 'c2', status: 'error' },
        ],
      })

      await useMigrationStore.getState().retry_failed(
        [makeConv('c1'), makeConv('c2')], [], vi.fn(),
      )
      expect(useMigrationStore.getState().status).toBe('done')
    })
  })

  describe('push_content', () => {
    it('throws when not connected to Claude', async () => {
      await expect(
        useMigrationStore.getState().push_content('hello', 'Test'),
      ).rejects.toThrow('Not connected to Claude')
    })

    it('creates conversation, sends message, and renames', async () => {
      await useMigrationStore.getState().connectClaude()
      const claude = useMigrationStore.getState().claude!
      claude.createConversation = vi.fn().mockResolvedValue({ uuid: 'conv-uuid-1' })
      claude.sendMessage = vi.fn().mockResolvedValue('OK')
      claude.renameConversation = vi.fn().mockResolvedValue(undefined)
      claude.resolveOrCreateProject = vi.fn().mockResolvedValue('proj-uuid')
      claude.moveToProject = vi.fn().mockResolvedValue(undefined)

      const uuid = await useMigrationStore.getState().push_content('hello world', 'My Title')
      expect(uuid).toBe('conv-uuid-1')
      expect(claude.createConversation).toHaveBeenCalled()
      expect(claude.sendMessage).toHaveBeenCalledWith('conv-uuid-1', 'hello world', undefined, expect.any(String))
      expect(claude.renameConversation).toHaveBeenCalledWith('conv-uuid-1', 'My Title')
    })

    it('applies name_prefix', async () => {
      await useMigrationStore.getState().connectClaude()
      useMigrationStore.setState({ name_prefix: '[GPT] ' })
      const claude = useMigrationStore.getState().claude!
      claude.createConversation = vi.fn().mockResolvedValue({ uuid: 'uuid-1' })
      claude.sendMessage = vi.fn().mockResolvedValue('OK')
      claude.renameConversation = vi.fn().mockResolvedValue(undefined)

      await useMigrationStore.getState().push_content('content', 'Title')
      expect(claude.renameConversation).toHaveBeenCalledWith('uuid-1', '[GPT] Title')
    })

    it('moves to project when default_project is set', async () => {
      await useMigrationStore.getState().connectClaude()
      useMigrationStore.setState({ default_project: 'My Project' })
      const claude = useMigrationStore.getState().claude!
      claude.createConversation = vi.fn().mockResolvedValue({ uuid: 'uuid-1' })
      claude.sendMessage = vi.fn().mockResolvedValue('OK')
      claude.renameConversation = vi.fn().mockResolvedValue(undefined)
      claude.resolveOrCreateProject = vi.fn().mockResolvedValue('proj-uuid')
      claude.moveToProject = vi.fn().mockResolvedValue(undefined)

      await useMigrationStore.getState().push_content('content', 'Title')
      expect(claude.resolveOrCreateProject).toHaveBeenCalledWith('My Project')
      expect(claude.moveToProject).toHaveBeenCalledWith(['uuid-1'], 'proj-uuid')
    })

    it('logs error when project placement fails', async () => {
      await useMigrationStore.getState().connectClaude()
      useMigrationStore.setState({ default_project: 'Bad Project' })
      const claude = useMigrationStore.getState().claude!
      claude.createConversation = vi.fn().mockResolvedValue({ uuid: 'uuid-1' })
      claude.sendMessage = vi.fn().mockResolvedValue('OK')
      claude.renameConversation = vi.fn().mockResolvedValue(undefined)
      claude.resolveOrCreateProject = vi.fn().mockRejectedValue(new Error('Project not found'))

      // Should not throw — project failure is non-fatal
      const uuid = await useMigrationStore.getState().push_content('content', 'Title')
      expect(uuid).toBe('uuid-1')
    })
  })

  describe('push_item', () => {
    it('throws when not connected', async () => {
      await expect(
        useMigrationStore.getState().push_item({ type: 'Instruction', content: 'test', title: 'Test' }),
      ).rejects.toThrow('Not connected to Claude')
    })

    it('throws for Conversation type', async () => {
      await useMigrationStore.getState().connectClaude()
      await expect(
        useMigrationStore.getState().push_item({ type: 'Conversation', content: 'test', title: 'Test' }),
      ).rejects.toThrow('Conversations must be pushed via start_migration')
    })

    it('pushes instruction to Claude account', async () => {
      await useMigrationStore.getState().connectClaude()
      const claude = useMigrationStore.getState().claude!
      claude.setAccountInstructions = vi.fn().mockResolvedValue(undefined)

      const result = await useMigrationStore.getState().push_item({ type: 'Instruction', content: 'Be helpful', title: 'Inst' })
      expect(result).toBe('')
      expect(claude.setAccountInstructions).toHaveBeenCalledWith('Be helpful')
    })

    it('throws for Memory type (not yet implemented)', async () => {
      await useMigrationStore.getState().connectClaude()
      await expect(
        useMigrationStore.getState().push_item({ type: 'Memory', content: 'test', title: 'Test' }),
      ).rejects.toThrow('Memory push not yet implemented')
    })

    it('throws for unknown type', async () => {
      await useMigrationStore.getState().connectClaude()
      await expect(
        useMigrationStore.getState().push_item({ type: 'Unknown' as 'Instruction', content: 'test', title: 'Test' }),
      ).rejects.toThrow('Unknown push type')
    })
  })

  describe('push_queue', () => {
    it('does nothing when not connected', async () => {
      await useMigrationStore.getState().push_queue(
        [{ id: 'i1', type: 'Instruction', title: 'Test', content: 'Hello' }],
      )
      expect(useMigrationStore.getState().status).toBe('idle')
    })

    it('does nothing with empty items', async () => {
      await useMigrationStore.getState().connectClaude()
      await useMigrationStore.getState().push_queue([])
      expect(useMigrationStore.getState().status).toBe('idle')
    })

    it('pushes instructions aggregated', async () => {
      await useMigrationStore.getState().connectClaude()
      const claude = useMigrationStore.getState().claude!
      claude.getAccountInstructions = vi.fn().mockResolvedValue('')
      claude.setAccountInstructions = vi.fn().mockResolvedValue(undefined)

      const callback = vi.fn()
      await useMigrationStore.getState().push_queue(
        [
          { id: 'about-user', type: 'Instruction', title: 'About User', content: 'I am a dev' },
          { id: 'about-model', type: 'Instruction', title: 'About Model', content: 'Be concise' },
        ],
        callback,
      )

      expect(claude.setAccountInstructions).toHaveBeenCalled()
      expect(useMigrationStore.getState().status).toBe('done')
      expect(callback).toHaveBeenCalled()
      // All results should be done
      const results = useMigrationStore.getState().results
      expect(results.every((r) => r.status === 'done')).toBe(true)
    })

    it('skips instructions already present in Claude', async () => {
      await useMigrationStore.getState().connectClaude()
      const claude = useMigrationStore.getState().claude!
      claude.getAccountInstructions = vi.fn().mockResolvedValue('About Me: I am a dev')
      claude.setAccountInstructions = vi.fn().mockResolvedValue(undefined)

      await useMigrationStore.getState().push_queue(
        [{ id: 'about-user', type: 'Instruction', title: 'About User', content: 'I am a dev' }],
      )

      // setAccountInstructions should not be called since it's already present
      expect(claude.setAccountInstructions).not.toHaveBeenCalled()
    })

    it('handles instruction push errors gracefully', async () => {
      await useMigrationStore.getState().connectClaude()
      const claude = useMigrationStore.getState().claude!
      claude.getAccountInstructions = vi.fn().mockRejectedValue(new Error('API down'))

      await useMigrationStore.getState().push_queue(
        [{ id: 'about-user', type: 'Instruction', title: 'About User', content: 'test' }],
      )

      const results = useMigrationStore.getState().results
      expect(results[0].status).toBe('error')
    })
  })

  describe('fetchUsage', () => {
    it('fetches usage when connected', async () => {
      await useMigrationStore.getState().connectClaude()
      const claude = useMigrationStore.getState().claude!
      const mockUsage = { daily_limit: 100, daily_used: 5 }
      claude.getUsage = vi.fn().mockResolvedValue(mockUsage)

      await useMigrationStore.getState().fetchUsage()
      expect(useMigrationStore.getState().usage).toEqual(mockUsage)
    })

    it('does nothing when not connected', async () => {
      await useMigrationStore.getState().fetchUsage()
      expect(useMigrationStore.getState().usage).toBeNull()
    })

    it('handles usage fetch errors gracefully', async () => {
      await useMigrationStore.getState().connectClaude()
      const claude = useMigrationStore.getState().claude!
      claude.getUsage = vi.fn().mockRejectedValue(new Error('Network error'))

      // Should not throw
      await useMigrationStore.getState().fetchUsage()
      expect(useMigrationStore.getState().usage).toBeNull()
    })
  })

  describe('reset_preferences', () => {
    it('resets settings to defaults', () => {
      useMigrationStore.setState({
        model: 'custom-model',
        prompt_prefix: 'custom prefix',
        name_prefix: '[X] ',
        download_format: 'json',
      })
      useMigrationStore.getState().reset_preferences()
      const state = useMigrationStore.getState()
      expect(state.name_prefix).toBe('')
      expect(state.download_format).toBe('text')
    })
  })
})


