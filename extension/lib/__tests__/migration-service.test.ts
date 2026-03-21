/**
 * Unit tests for migration-service.ts (pushConversation).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock chrome APIs
vi.stubGlobal('chrome', {
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn(), remove: vi.fn() } },
  cookies: { get: vi.fn() },
  runtime: { sendMessage: vi.fn() },
})

// Mock storage
vi.mock('../storage', () => ({}))

vi.mock('../storage/tracking-repository', () => ({
  patchTracking: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../logger', () => ({
  logger: {
    debug: vi.fn().mockResolvedValue(undefined),
    info: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
    error: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../transform/gpt-to-claude', () => ({
  formatTranscript: vi.fn().mockReturnValue('Transcript content'),
}))

vi.mock('../destinations/claude', () => ({
  ClaudeDestination: vi.fn(),
}))

import { MigrationService } from '../services/migration-service'
import { patchTracking } from '../storage/tracking-repository'
import { ChatGPTConversation } from '../sources/chatgpt-conversation'
import type { IConversation } from '../interfaces/conversation'
import type { Project } from '../interfaces/project'
import type { ClaudeDestination } from '../destinations/claude'

function make_conv(overrides: Record<string, unknown> = {}): IConversation {
  return new ChatGPTConversation({
    id: 'c1',
    title: 'Test Conversation',
    created_at: '2024-01-15T10:00:00Z',
    update_time: undefined,
    current_node: null,
    mapping: {},
    ...overrides,
  })
}

function makeClaude(): ClaudeDestination {
  return {
    listProjects: vi.fn().mockResolvedValue([]),
    createConversation: vi.fn().mockResolvedValue({ uuid: 'claude-uuid-1' }),
    sendMessage: vi.fn().mockResolvedValue('OK'),
    renameConversation: vi.fn().mockResolvedValue(undefined),
    createProject: vi.fn().mockResolvedValue({ uuid: 'project-uuid-1' }),
    moveToProject: vi.fn().mockResolvedValue(undefined),
    resolveOrCreateProject: vi.fn().mockResolvedValue('proj-uuid'),
    setProjectInstructions: vi.fn().mockResolvedValue(undefined),
  } as unknown as ClaudeDestination
}

describe('MigrationService', () => {
  let claude: ReturnType<typeof makeClaude>
  let service: MigrationService

  beforeEach(() => {
    vi.clearAllMocks()
    claude = makeClaude()
    service = new MigrationService(claude, [])
  })

  describe('init', () => {
    it('should build conv→project map from projects', async () => {
      const projects: Project[] = [
        { id: 'p1', name: 'My Project', created_at: null, updated_at: null, conversation_ids: ['c1', 'c2'] },
      ]
      const svc = new MigrationService(claude, projects)
      await svc.init()
      // No error means init succeeded
    })

    it('should cache existing Claude projects', async () => {
      const mockClaude = makeClaude()
      vi.mocked(mockClaude.listProjects).mockResolvedValue([
        { uuid: 'up1', name: 'Existing Project' },
      ])
      const projects: Project[] = [
        { id: 'gpt-p1', name: 'Existing Project', created_at: null, updated_at: null, conversation_ids: ['c1'] },
      ]
      const svc = new MigrationService(mockClaude, projects)
      await svc.init()

      const conv = make_conv({ project_id: 'gpt-p1' })
      await svc.pushConversation(conv, { prompt_prefix: '', prompt_suffix: '', push_format: 'text', name_prefix: '[GPT] ' })

      expect(vi.mocked(mockClaude.createProject)).not.toHaveBeenCalled()
    })
  })

  describe('pushConversation', () => {
    it('should push and return done result', async () => {
      await service.init()
      const result = await service.pushConversation(make_conv(), { prompt_prefix: '', prompt_suffix: '', push_format: 'text', name_prefix: '[GPT] ' })

      expect(result.status).toBe('done')
      expect(result.claude_id).toBe('claude-uuid-1')
      expect(vi.mocked(claude.createConversation)).toHaveBeenCalled()
      expect(vi.mocked(claude.sendMessage)).toHaveBeenCalled()
      expect(vi.mocked(claude.renameConversation)).toHaveBeenCalledWith('claude-uuid-1', '[GPT] Test Conversation')
      expect(patchTracking).toHaveBeenCalled()
    })

    it('should return error result when push fails', async () => {
      vi.mocked(claude.createConversation).mockRejectedValue(new Error('Network error'))
      await service.init()
      const result = await service.pushConversation(make_conv(), { prompt_prefix: '', prompt_suffix: '', push_format: 'text', name_prefix: '' })

      expect(result.status).toBe('error')
      expect(result.error).toContain('Network error')
    })

    it('should pass prompt_prefix through to formatTranscript', async () => {
      const { formatTranscript } = await import('../transform/gpt-to-claude')
      await service.init()
      await service.pushConversation(make_conv(), { prompt_prefix: 'CONTEXT:', prompt_suffix: '', push_format: 'text', name_prefix: '' })

      // The prefix is passed to formatTranscript via prepareConversationMessage
      expect(formatTranscript).toHaveBeenCalledWith(
        expect.anything(),
        'CONTEXT:',
        '',
        expect.any(Function),
      )
    })

    it('should resolve project via project_id when not in conv_project_map', async () => {
      const projects: Project[] = [
        { id: 'p1', name: 'Resolved Project', created_at: null, updated_at: null, conversation_ids: [] },
      ]
      const mockClaude = makeClaude()
      const svc = new MigrationService(mockClaude, projects)
      await svc.init()

      // Conv has project_id that matches a project but is NOT in conv_project_map (empty conversation_ids)
      const conv = make_conv({ id: 'c1', project_id: 'p1' })
      const result = await svc.pushConversation(conv, { prompt_prefix: '', prompt_suffix: '', push_format: 'text', name_prefix: '' })

      expect(result.status).toBe('done')
      expect(vi.mocked(mockClaude.resolveOrCreateProject)).toHaveBeenCalledWith('Resolved Project', '')
    })

    it('should use default_project when conversation has no project', async () => {
      const mockClaude = makeClaude()
      vi.mocked(mockClaude.resolveOrCreateProject).mockResolvedValue('default-proj-uuid')
      const svc = new MigrationService(mockClaude, [])
      await svc.init()

      const conv = make_conv({ id: 'c1' })
      await svc.pushConversation(conv, { prompt_prefix: '', prompt_suffix: '', push_format: 'text', name_prefix: '', default_project: 'Default Project' })

      expect(vi.mocked(mockClaude.resolveOrCreateProject)).toHaveBeenCalledWith('Default Project', '')
      expect(vi.mocked(mockClaude.moveToProject)).toHaveBeenCalled()
    })

    it('should set project instructions when project has a description', async () => {
      const projects: Project[] = [
        { id: 'p1', name: 'My Project', description: 'Project instructions here', created_at: null, updated_at: null, conversation_ids: ['c1'] },
      ]
      const mockClaude = makeClaude()
      const svc = new MigrationService(mockClaude, projects)
      await svc.init()

      const conv = make_conv({ id: 'c1' })
      await svc.pushConversation(conv, { prompt_prefix: '', prompt_suffix: '', push_format: 'text', name_prefix: '' })

      expect(vi.mocked(mockClaude.resolveOrCreateProject)).toHaveBeenCalledWith('My Project', 'Project instructions here')
      expect(vi.mocked(mockClaude.setProjectInstructions)).toHaveBeenCalledWith('proj-uuid', 'Project instructions here')
    })

    it('should handle setProjectInstructions failure silently', async () => {
      const projects: Project[] = [
        { id: 'p1', name: 'My Project', description: 'Instructions', created_at: null, updated_at: null, conversation_ids: ['c1'] },
      ]
      const mockClaude = makeClaude()
      vi.mocked(mockClaude.setProjectInstructions).mockRejectedValue(new Error('Permission denied'))
      const svc = new MigrationService(mockClaude, projects)
      await svc.init()

      const conv = make_conv({ id: 'c1' })
      const result = await svc.pushConversation(conv, { prompt_prefix: '', prompt_suffix: '', push_format: 'text', name_prefix: '' })

      // Should still succeed — setProjectInstructions failure is non-fatal
      expect(result.status).toBe('done')
    })
  })
})

