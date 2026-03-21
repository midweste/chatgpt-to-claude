/**
 * Unit tests for pushed-status-service.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock chrome APIs
vi.stubGlobal('chrome', {
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn(), remove: vi.fn() } },
  cookies: { get: vi.fn() },
  runtime: { sendMessage: vi.fn() },
})

// Mock dependencies
vi.mock('../storage', () => ({
  getAllTracking: vi.fn().mockResolvedValue([]),
  getAllConversations: vi.fn().mockResolvedValue([]),
}))

vi.mock('../storage/tracking-repository', () => ({
  patchTracking: vi.fn().mockResolvedValue(undefined),
  putTracking: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn().mockResolvedValue(undefined),
    error: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../destinations/claude', () => ({
  ClaudeDestination: vi.fn(),
}))

import { refreshPushedStatus } from '../services/pushed-status-service'
import { getAllTracking, getAllConversations } from '../storage'
import { patchTracking, putTracking } from '../storage/tracking-repository'
import type { ClaudeDestination } from '../destinations/claude'
import type { ChatGPTRawConversation } from '../interfaces/chatgpt-api-types'

function makeClaude(convs: Array<{ uuid: string; name: string }>): ClaudeDestination {
  return {
    listConversations: vi.fn().mockResolvedValue(convs),
  } as unknown as ClaudeDestination
}

describe('refreshPushedStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should mark conversations that exist on Claude but are not tracked locally', async () => {
    const claude = makeClaude([{ uuid: 'claude-1', name: 'Test' }])
    vi.mocked(getAllTracking).mockResolvedValue([
      { id: 'c1', type: 'conversation', is_selected: true, status: 'extracted', claude_id: 'claude-1' },
    ])

    const result = await refreshPushedStatus(claude)
    expect(result.marked).toBe(1)
    expect(result.unmarked).toBe(0)
    expect(patchTracking).toHaveBeenCalledWith('c1', { status: 'done' })
  })

  it('should unmark conversations tracked as done but deleted from Claude', async () => {
    const claude = makeClaude([]) // empty — nothing on Claude
    vi.mocked(getAllTracking).mockResolvedValue([
      { id: 'c1', type: 'conversation', is_selected: true, status: 'done', claude_id: 'claude-99' },
    ])

    const result = await refreshPushedStatus(claude)
    expect(result.marked).toBe(0)
    expect(result.unmarked).toBe(1)
    expect(patchTracking).toHaveBeenCalledWith('c1', { status: 'extracted', claude_id: undefined, pushed_at: undefined })
  })

  it('should unmark conversations pushed before ID tracking (no claude_id)', async () => {
    const claude = makeClaude([{ uuid: 'claude-1', name: 'Something' }])
    vi.mocked(getAllTracking).mockResolvedValue([
      { id: 'c1', type: 'conversation', is_selected: true, status: 'done' },
    ])

    const result = await refreshPushedStatus(claude)
    expect(result.unmarked).toBe(1)
  })

  it('should not patch when nothing changed', async () => {
    const claude = makeClaude([{ uuid: 'claude-1', name: 'Test' }])
    vi.mocked(getAllTracking).mockResolvedValue([
      { id: 'c1', type: 'conversation', is_selected: true, status: 'done', claude_id: 'claude-1' },
    ])

    const result = await refreshPushedStatus(claude)
    expect(result.marked).toBe(0)
    expect(result.unmarked).toBe(0)
    expect(patchTracking).not.toHaveBeenCalled()
  })

  it('should return checked count reflecting Claude conversation count', async () => {
    const claude = makeClaude([
      { uuid: 'a', name: 'A' },
      { uuid: 'b', name: 'B' },
      { uuid: 'c', name: 'C' },
    ])
    vi.mocked(getAllTracking).mockResolvedValue([])

    const result = await refreshPushedStatus(claude)
    expect(result.checked).toBe(3)
  })

  it('should mark via title fallback when no claude_id match', async () => {
    const claude = makeClaude([{ uuid: 'claude-1', name: '[GPT] My Conv' }])
    vi.mocked(getAllTracking).mockResolvedValue([
      { id: 'c1', type: 'conversation', is_selected: true, status: 'extracted' },
    ])
    vi.mocked(getAllConversations).mockResolvedValue([
      { id: 'c1', title: 'My Conv' } as unknown as ChatGPTRawConversation,
    ])

    const result = await refreshPushedStatus(claude)
    expect(result.marked).toBe(1)
    expect(patchTracking).toHaveBeenCalledWith('c1', { status: 'done', claude_id: 'claude-1' })
  })

  it('should re-link via title fallback when claude_id is gone from Claude', async () => {
    // Conv was pushed (has claude_id) but that ID is no longer on Claude — title match finds the new UUID
    const claude = makeClaude([{ uuid: 'claude-new', name: '[GPT] My Conv' }])
    vi.mocked(getAllTracking).mockResolvedValue([
      { id: 'c1', type: 'conversation', is_selected: true, status: 'done', claude_id: 'claude-old' },
    ])
    vi.mocked(getAllConversations).mockResolvedValue([
      { id: 'c1', title: 'My Conv' } as unknown as ChatGPTRawConversation,
    ])

    const result = await refreshPushedStatus(claude)
    expect(result.unmarked).toBe(0)
    expect(patchTracking).toHaveBeenCalledWith('c1', { status: 'done', claude_id: 'claude-new' })
  })

  it('should unmark pushed conv with no claude_id when title fallback finds nothing', async () => {
    const claude = makeClaude([{ uuid: 'claude-1', name: 'Something Else' }])
    vi.mocked(getAllTracking).mockResolvedValue([
      { id: 'c1', type: 'conversation', is_selected: true, status: 'done' },
    ])
    vi.mocked(getAllConversations).mockResolvedValue([
      { id: 'c1', title: 'Original Title' } as unknown as ChatGPTRawConversation,
    ])

    const result = await refreshPushedStatus(claude)
    expect(result.unmarked).toBe(1)
    expect(patchTracking).toHaveBeenCalledWith('c1', { status: 'extracted' })
  })

  it('should create tracking for untracked local conversations found on Claude (second pass)', async () => {
    const claude = makeClaude([{ uuid: 'claude-1', name: '[GPT] Untracked Conv' }])
    vi.mocked(getAllTracking).mockResolvedValue([]) // no tracking records
    vi.mocked(getAllConversations).mockResolvedValue([
      { id: 'c1', title: 'Untracked Conv' } as unknown as ChatGPTRawConversation,
    ])

    const result = await refreshPushedStatus(claude)
    expect(result.marked).toBe(1)
    expect(putTracking).toHaveBeenCalledWith(expect.objectContaining({
      id: 'c1',
      type: 'conversation',
      status: 'done',
      claude_id: 'claude-1',
    }))
  })

  it('should use prefetched_convs when provided instead of calling listConversations', async () => {
    const claude = makeClaude([]) // listConversations returns empty
    const prefetched = [{ uuid: 'pre-1', name: '[GPT] Pre-fetched' }]
    vi.mocked(getAllTracking).mockResolvedValue([
      { id: 'c1', type: 'conversation', is_selected: true, status: 'extracted', claude_id: 'pre-1' },
    ])

    const result = await refreshPushedStatus(claude, prefetched)
    expect(result.marked).toBe(1)
    expect(claude.listConversations).not.toHaveBeenCalled()
  })

  it('should filter to only conversation type tracking records', async () => {
    const claude = makeClaude([{ uuid: 'claude-1', name: 'Test' }])
    vi.mocked(getAllTracking).mockResolvedValue([
      { id: 'm1', type: 'memory', is_selected: true, status: 'extracted', claude_id: 'claude-1' },
    ])

    const result = await refreshPushedStatus(claude)
    // Memory records should be ignored
    expect(result.marked).toBe(0)
    expect(patchTracking).not.toHaveBeenCalled()
  })
})
