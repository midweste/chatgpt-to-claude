/**
 * Unit tests for ClaudeMemory entity.
 */

import { describe, it, expect, vi } from 'vitest'
import { ClaudeMemory } from '../../lib/destinations/claude-memory'
import type { IMemory } from '../../lib/interfaces'

import type { ClaudeDestination } from '../../lib/destinations/claude'

vi.mock('../../lib/logger', () => ({
  logger: {
    info: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
    error: vi.fn().mockResolvedValue(undefined),
  },
}))

function make_memory(overrides: Partial<IMemory> = {}): IMemory {
  return {
    data: {},
    id: 'm1',
    content: 'I like cats',
    created_at: '2024-01-15T10:00:00Z',
    ...overrides,
  }
}

function make_claude_mock() {
  return {
    createConversation: vi.fn().mockResolvedValue({ uuid: 'claude-conv-1' }),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    renameConversation: vi.fn().mockResolvedValue(undefined),
    authenticate: vi.fn(),
    getAccountInstructions: vi.fn(),
    setAccountInstructions: vi.fn(),
  } as unknown as ClaudeDestination
}

describe('ClaudeMemory', () => {
  describe('format', () => {
    it('formats memories with dates', () => {
      const result = ClaudeMemory.format([
        make_memory({ content: 'I like cats', created_at: '2024-01-15T10:00:00Z' }),
        make_memory({ content: 'I like dogs', created_at: '2024-06-01T00:00:00Z' }),
      ])

      expect(result).toContain('I like cats')
      expect(result).toContain('I like dogs')
      expect(result).toContain('[')
      expect(result).toContain(']')
    })

    it('uses "Unknown date" for memories without dates', () => {
      const result = ClaudeMemory.format([
        make_memory({ content: 'No date', created_at: null }),
      ])

      expect(result).toContain('[Unknown date] - No date')
    })

    it('joins multiple memories with newlines', () => {
      const result = ClaudeMemory.format([
        make_memory({ content: 'First' }),
        make_memory({ content: 'Second' }),
      ])

      const lines = result.split('\n')
      expect(lines).toHaveLength(2)
    })
  })

  describe('push', () => {
    it('creates conversation, sends message, and renames', async () => {
      const claude = make_claude_mock()
      const entity = new ClaudeMemory([make_memory()], claude)

      const uuid = await entity.push()

      expect(uuid).toBe('claude-conv-1')
      expect(claude.createConversation).toHaveBeenCalled()
      expect(claude.sendMessage).toHaveBeenCalledWith(
        'claude-conv-1',
        expect.stringContaining('I like cats'),
        undefined,
        'claude-sonnet-4-20250514',
      )
      expect(claude.renameConversation).toHaveBeenCalledWith('claude-conv-1', 'ChatGPT Memories')
    })

    it('prepends prompt_prefix when provided', async () => {
      const claude = make_claude_mock()
      const entity = new ClaudeMemory([make_memory()], claude)

      await entity.push({ prompt_prefix: 'Please confirm' })

      expect(claude.sendMessage).toHaveBeenCalledWith(
        'claude-conv-1',
        expect.stringMatching(/^Please confirm\n\n/),
        undefined,
        'claude-sonnet-4-20250514',
      )
    })

    it('uses custom model when provided', async () => {
      const claude = make_claude_mock()
      const entity = new ClaudeMemory([make_memory()], claude)

      await entity.push({ model: 'claude-opus-4-6' })

      expect(claude.sendMessage).toHaveBeenCalledWith(
        'claude-conv-1',
        expect.any(String),
        undefined,
        'claude-opus-4-6',
      )
    })
  })

  describe('properties', () => {
    it('has correct title with count', () => {
      const claude = make_claude_mock()
      const entity = new ClaudeMemory([make_memory(), make_memory()], claude)
      expect(entity.title).toBe('2 memories')
    })

    it('has formatted content', () => {
      const claude = make_claude_mock()
      const entity = new ClaudeMemory([make_memory()], claude)
      expect(entity.content).toContain('I like cats')
    })
  })
})
