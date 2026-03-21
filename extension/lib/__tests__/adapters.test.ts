/**
 * Unit tests for adapter wrapper classes.
 */

import { describe, it, expect } from 'vitest'
import { ChatGPTConversation } from '../sources/chatgpt-conversation'
import { ChatGPTMemory } from '../sources/chatgpt-memory'
import { ChatGPTInstruction } from '../sources/chatgpt-instruction'
import { safeTimestamp } from '../utils/timestamp'

// ── safeTimestamp ──

describe('safeTimestamp', () => {
  it('returns null for null/undefined', () => {
    expect(safeTimestamp(null)).toBeNull()
    expect(safeTimestamp(undefined)).toBeNull()
  })

  it('parses ISO string', () => {
    const result = safeTimestamp('2024-01-15T10:00:00Z')
    expect(result).toBe('2024-01-15T10:00:00.000Z')
  })

  it('parses epoch seconds', () => {
    const result = safeTimestamp(1700000000)
    expect(result).toMatch(/^2023-11-14T/)
  })

  it('parses epoch milliseconds', () => {
    const result = safeTimestamp(1700000000000)
    expect(result).toMatch(/^2023-11-14T/)
  })

  it('returns null for invalid string', () => {
    expect(safeTimestamp('not-a-date')).toBeNull()
  })

  it('returns null for non-date types', () => {
    expect(safeTimestamp(true)).toBeNull()
    expect(safeTimestamp({})).toBeNull()
  })
})

// ── ChatGPTConversation ──

describe('ChatGPTConversation', () => {
  it('reads id from conversation_id field', () => {
    const conv = new ChatGPTConversation({ conversation_id: 'abc', title: 'Test' })
    expect(conv.id).toBe('abc')
  })

  it('falls back to id field', () => {
    const conv = new ChatGPTConversation({ id: 'xyz', title: 'Test' })
    expect(conv.id).toBe('xyz')
  })

  it('returns empty string when no id', () => {
    const conv = new ChatGPTConversation({ title: 'Test' })
    expect(conv.id).toBe('')
  })

  it('returns title or Untitled with id suffix', () => {
    expect(new ChatGPTConversation({ title: 'Hello' }).title).toBe('Hello')
    expect(new ChatGPTConversation({}).title).toBe('Untitled')
    expect(new ChatGPTConversation({ title: '' }).title).toBe('Untitled')
    expect(new ChatGPTConversation({ id: 'abc12345-6789', title: '' }).title).toBe('Untitled (abc12345)')
  })

  it('reads model from default_model_slug', () => {
    const conv = new ChatGPTConversation({ default_model_slug: 'gpt-4' })
    expect(conv.model).toBe('gpt-4')
  })

  it('returns null model when missing', () => {
    const conv = new ChatGPTConversation({})
    expect(conv.model).toBeNull()
  })

  it('counts active path user/assistant messages for message_count', () => {
    const conv = new ChatGPTConversation({
      mapping: {
        root: { children: ['sys'] },
        sys: { parent: 'root', message: { author: { role: 'system' }, content: { content_type: 'text', parts: [''] } }, children: ['u1'] },
        u1: { parent: 'sys', message: { author: { role: 'user' }, content: { content_type: 'text', parts: ['hello'] } }, children: ['a1'] },
        a1: { parent: 'u1', message: { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['hi'] } }, children: [] },
      },
    })
    expect(conv.message_count).toBe(2)
  })

  it('excludes model_editable_context from message_count', () => {
    const conv = new ChatGPTConversation({
      mapping: {
        root: { children: ['sys'] },
        sys: { parent: 'root', message: { author: { role: 'system' }, content: { content_type: 'text', parts: [''] } }, children: ['u1'] },
        u1: { parent: 'sys', message: { author: { role: 'user' }, content: { content_type: 'text', parts: ['question'] } }, children: ['ctx'] },
        ctx: { parent: 'u1', message: { author: { role: 'assistant' }, content: { content_type: 'model_editable_context', model_set_context: '' } }, children: ['a1'] },
        a1: { parent: 'ctx', message: { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['answer'] } }, children: [] },
      },
    })
    expect(conv.message_count).toBe(2)
  })

  it('returns 0 message_count when no mapping', () => {
    const conv = new ChatGPTConversation({})
    expect(conv.message_count).toBe(0)
  })

  it('reads project_id from gizmo_id', () => {
    const conv = new ChatGPTConversation({ gizmo_id: 'g-p-123' })
    expect(conv.project_id).toBe('g-p-123')
  })

  it('reads is_archived', () => {
    expect(new ChatGPTConversation({ is_archived: true }).is_archived).toBe(true)
    expect(new ChatGPTConversation({}).is_archived).toBe(false)
  })

  it('reads created_at from create_time', () => {
    const conv = new ChatGPTConversation({ create_time: 1700000000 })
    expect(conv.created_at).toMatch(/^2023-11-14T/)
  })

  it('reads created_at from ISO string', () => {
    const conv = new ChatGPTConversation({ created_at: '2024-01-15T00:00:00Z' })
    expect(conv.created_at).toBe('2024-01-15T00:00:00.000Z')
  })

  it('falls back to earliest mapping create_time', () => {
    const conv = new ChatGPTConversation({
      mapping: {
        n1: { message: { create_time: 1700000100 } },
        n2: { message: { create_time: 1700000000 } },
        n3: {}, // no message
      },
    })
    expect(conv.created_at).toMatch(/^2023-11-14T/)
  })

  it('reads updated_at from update_time', () => {
    const conv = new ChatGPTConversation({ update_time: 1700100000 })
    expect(conv.updated_at).toMatch(/^2023-11-16T/)
  })

  it('returns null updated_at when missing', () => {
    const conv = new ChatGPTConversation({})
    expect(conv.updated_at).toBeNull()
  })
})

// ── ChatGPTMemory ──

describe('ChatGPTMemory', () => {
  it('reads content from various field names', () => {
    expect(new ChatGPTMemory({ content: 'A' }).content).toBe('A')
    expect(new ChatGPTMemory({ value: 'B' }).content).toBe('B')
    expect(new ChatGPTMemory({ text: 'C' }).content).toBe('C')
    expect(new ChatGPTMemory({ memory: 'D' }).content).toBe('D')
    expect(new ChatGPTMemory({}).content).toBe('')
  })

  it('reads created_at from various field names', () => {
    expect(new ChatGPTMemory({ created_timestamp: 1700000000 }).created_at).toMatch(/^2023-11-14T/)
    expect(new ChatGPTMemory({ created_at: '2024-01-15T00:00:00Z' }).created_at).toBe('2024-01-15T00:00:00.000Z')
    expect(new ChatGPTMemory({ create_time: 1700000000 }).created_at).toMatch(/^2023-11-14T/)
    expect(new ChatGPTMemory({}).created_at).toBeNull()
  })

  it('reads updated_at from various field names', () => {
    expect(new ChatGPTMemory({ updated_at: '2024-06-01T00:00:00Z' }).updated_at).toBe('2024-06-01T00:00:00.000Z')
    expect(new ChatGPTMemory({ update_time: 1700000000 }).updated_at).toMatch(/^2023-11-14T/)
    expect(new ChatGPTMemory({ updated_timestamp: 1700000000 }).updated_at).toMatch(/^2023-11-14T/)
    expect(new ChatGPTMemory({}).updated_at).toBeNull()
  })
})

// ── ChatGPTInstruction ──

describe('ChatGPTInstruction', () => {
  it('reads about_user from about_user_message', () => {
    const inst = new ChatGPTInstruction({ about_user_message: 'Dev' })
    expect(inst.about_user).toBe('Dev')
  })

  it('returns null about_user when missing', () => {
    expect(new ChatGPTInstruction({}).about_user).toBeNull()
    expect(new ChatGPTInstruction({ about_user_message: '' }).about_user).toBeNull()
  })

  it('reads about_model from about_model_message', () => {
    const inst = new ChatGPTInstruction({ about_model_message: 'Be concise' })
    expect(inst.about_model).toBe('Be concise')
  })

  it('returns null about_model when missing', () => {
    expect(new ChatGPTInstruction({}).about_model).toBeNull()
  })
})
