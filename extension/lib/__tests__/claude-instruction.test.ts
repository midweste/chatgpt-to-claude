/**
 * Unit tests for ClaudeInstruction entity.
 */

import { describe, it, expect, vi } from 'vitest'
import { ClaudeInstruction } from '../../lib/destinations/claude-instruction'
import type { IInstruction } from '../../lib/interfaces'

import type { ClaudeDestination } from '../../lib/destinations/claude'

vi.mock('../../lib/logger', () => ({
  logger: {
    info: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
    error: vi.fn().mockResolvedValue(undefined),
  },
}))

function make_instruction(overrides: Partial<IInstruction> = {}): IInstruction {
  return {
    data: {},
    about_user: 'I am a developer',
    about_model: 'Be concise',
    ...overrides,
  }
}

function make_claude_mock(existing_instructions = '') {
  return {
    getAccountInstructions: vi.fn().mockResolvedValue(existing_instructions),
    setAccountInstructions: vi.fn().mockResolvedValue(undefined),
    authenticate: vi.fn(),
    createConversation: vi.fn(),
    sendMessage: vi.fn(),
    renameConversation: vi.fn(),
  } as unknown as ClaudeDestination
}

describe('ClaudeInstruction', () => {
  describe('format', () => {
    it('formats both about_user and about_model', () => {
      const result = ClaudeInstruction.format(make_instruction())
      expect(result).toBe('About Me: I am a developer\nResponse Style: Be concise')
    })

    it('formats only about_user when about_model is null', () => {
      const result = ClaudeInstruction.format(make_instruction({ about_model: null }))
      expect(result).toBe('About Me: I am a developer')
    })

    it('formats only about_model when about_user is null', () => {
      const result = ClaudeInstruction.format(make_instruction({ about_user: null }))
      expect(result).toBe('Response Style: Be concise')
    })

    it('returns empty string when both are null', () => {
      const result = ClaudeInstruction.format(make_instruction({ about_user: null, about_model: null }))
      expect(result).toBe('')
    })
  })

  describe('push', () => {
    it('appends new instructions to existing', async () => {
      const claude = make_claude_mock('Existing instructions')
      const entity = new ClaudeInstruction(make_instruction(), claude)

      await entity.push()

      expect(claude.getAccountInstructions).toHaveBeenCalled()
      expect(claude.setAccountInstructions).toHaveBeenCalledWith(
        expect.stringContaining('Existing instructions'),
      )
    })

    it('sets instructions when none exist', async () => {
      const claude = make_claude_mock('')
      const entity = new ClaudeInstruction(make_instruction(), claude)

      await entity.push()

      expect(claude.setAccountInstructions).toHaveBeenCalledWith(
        'About Me: I am a developer\nResponse Style: Be concise',
      )
    })

    it('skips when instructions already present', async () => {
      const existing = 'About Me: I am a developer\nResponse Style: Be concise'
      const claude = make_claude_mock(existing)
      const entity = new ClaudeInstruction(make_instruction(), claude)

      await entity.push()

      expect(claude.setAccountInstructions).not.toHaveBeenCalled()
    })

    it('returns empty string', async () => {
      const claude = make_claude_mock('')
      const entity = new ClaudeInstruction(make_instruction(), claude)

      const result = await entity.push()
      expect(result).toBe('')
    })
  })

  describe('properties', () => {
    it('has correct title', () => {
      const claude = make_claude_mock()
      const entity = new ClaudeInstruction(make_instruction(), claude)
      expect(entity.title).toBe('Custom Instructions')
    })

    it('has formatted content', () => {
      const claude = make_claude_mock()
      const entity = new ClaudeInstruction(make_instruction(), claude)
      expect(entity.content).toContain('About Me:')
      expect(entity.content).toContain('Response Style:')
    })
  })
})
