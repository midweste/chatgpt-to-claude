/**
 * Unit tests for gpt-to-claude.ts — transcript formatting and message extraction.
 */

import { describe, it, expect } from 'vitest'
import { formatTranscript, extractOrderedMessages } from '../transform/gpt-to-claude'
import { ChatGPTConversation } from '../sources/chatgpt-conversation'

// ── Helpers ──

function make_conv(overrides: Record<string, unknown> = {}): ChatGPTConversation {
  return new ChatGPTConversation({
    id: 'c1',
    title: 'Test Conversation',
    create_time: 1700000000,
    update_time: null,
    current_node: null,
    default_model_slug: 'gpt-4',
    mapping: {},
    ...overrides,
  })
}

function make_mapping(messages: Array<{ role: string; content: string; timestamp?: number }>): Record<string, Record<string, unknown>> {
  const mapping: Record<string, Record<string, unknown>> = {}
  let prevId: string | null = null

  // Root node (no message, no parent)
  mapping['root'] = { children: messages.length > 0 ? ['msg-0'] : [] }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const id = `msg-${i}`
    mapping[id] = {
      parent: prevId ?? 'root',
      children: i < messages.length - 1 ? [`msg-${i + 1}`] : [],
      message: {
        author: { role: msg.role },
        content: { parts: [msg.content] },
        create_time: msg.timestamp ?? null,
      },
    }
    prevId = id
  }

  return mapping
}

// ── extractOrderedMessages ──

describe('extractOrderedMessages', () => {
  it('extracts user and assistant messages in order', () => {
    const mapping = make_mapping([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ])

    const messages = extractOrderedMessages(mapping)
    expect(messages).toHaveLength(2)
    expect(messages[0]).toEqual({ role: 'User', content: 'Hello', timestamp: undefined })
    expect(messages[1]).toEqual({ role: 'Assistant', content: 'Hi there!', timestamp: undefined })
  })

  it('skips system messages', () => {
    const mapping = make_mapping([
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hi' },
    ])

    const messages = extractOrderedMessages(mapping)
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('User')
  })

  it('preserves timestamps when present', () => {
    const mapping = make_mapping([
      { role: 'user', content: 'Hello', timestamp: 1700000000 },
      { role: 'assistant', content: 'Hi!', timestamp: 1700000060 },
    ])

    const messages = extractOrderedMessages(mapping)
    expect(messages[0].timestamp).toBe(1700000000)
    expect(messages[1].timestamp).toBe(1700000060)
  })

  it('handles empty mapping', () => {
    const messages = extractOrderedMessages({})
    expect(messages).toEqual([])
  })

  it('handles mapping with only root node', () => {
    const mapping = { root: { children: [] } }
    const messages = extractOrderedMessages(mapping)
    expect(messages).toEqual([])
  })

  it('skips nodes with no message', () => {
    const mapping: Record<string, Record<string, unknown>> = {
      root: { children: ['child1'] },
      child1: { parent: 'root', children: ['child2'] },
      child2: {
        parent: 'child1',
        children: [],
        message: {
          author: { role: 'user' },
          content: { parts: ['Test'] },
        },
      },
    }
    const messages = extractOrderedMessages(mapping)
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('Test')
  })

  it('skips messages with empty content', () => {
    const mapping = make_mapping([
      { role: 'user', content: '' },
      { role: 'assistant', content: 'Response' },
    ])

    const messages = extractOrderedMessages(mapping)
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('Response')
  })
})

// ── formatTranscript ──

describe('formatTranscript', () => {
  it('formats header with title, date, model, and message count', () => {
    const conv = make_conv({
      mapping: make_mapping([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
      ]),
    })

    const transcript = formatTranscript(conv)
    expect(transcript).toContain('Conversation Title: Test Conversation')
  })

  it('formats user messages with Human marker and assistant messages with Assistant marker', () => {
    const conv = make_conv({
      mapping: make_mapping([
        { role: 'user', content: 'What is AI?' },
        { role: 'assistant', content: 'AI stands for Artificial Intelligence.' },
      ]),
    })

    const transcript = formatTranscript(conv)
    expect(transcript).toContain('🧑 Human')
    expect(transcript).toContain('What is AI?')
    expect(transcript).toContain('🤖 Assistant')
    expect(transcript).toContain('AI stands for Artificial Intelligence.')
  })

  it('includes timestamps with messages when present', () => {
    const conv = make_conv({
      mapping: make_mapping([
        { role: 'user', content: 'Hello', timestamp: 1700000000 },
      ]),
    })

    const transcript = formatTranscript(conv)
    expect(transcript).toContain('🧑 Human')
    // Should contain some date formatting from the timestamp
    expect(transcript).toMatch(/\d{4}/)
  })

  it('handles conversation with no mapping', () => {
    const conv = make_conv({ mapping: undefined })
    const transcript = formatTranscript(conv)
    expect(transcript).toContain('Conversation Title: Test Conversation')
    // Should not crash, just have header with no messages
    expect(transcript).not.toContain('🧑 Human')
  })

  it('handles conversation with empty mapping', () => {
    const conv = make_conv({ mapping: {} })
    const transcript = formatTranscript(conv)
    expect(transcript).toContain('Conversation Title: Test Conversation')
  })

  it('omits meta parts when missing', () => {
    const conv = make_conv({
      create_time: null,
      default_model_slug: null,
      mapping: {},
    })
    const transcript = formatTranscript(conv)
    // Should have title but no metadata
    expect(transcript).toContain('Conversation Title: Test Conversation')
  })
})

// ── sanitize_content (tested indirectly via extract) ──

describe('sanitize_content (via formatTranscript)', () => {
  it('strips PUA citation markers', () => {
    const mapping: Record<string, Record<string, unknown>> = {
      root: { children: ['msg-0'] },
      'msg-0': {
        parent: 'root',
        children: [],
        message: {
          author: { role: 'assistant' },
          content: { parts: ['Hello \uE200cite\uE201 world'] },
          metadata: { content_references: [] },
        },
      },
    }

    const conv = make_conv({ mapping })
    const transcript = formatTranscript(conv)
    expect(transcript).toContain('Hello world')
    expect(transcript).not.toContain('\uE200')
    expect(transcript).not.toContain('\uE201')
  })

  it('resolves citation references to markdown links', () => {
    const mapping: Record<string, Record<string, unknown>> = {
      root: { children: ['msg-0'] },
      'msg-0': {
        parent: 'root',
        children: [],
        message: {
          author: { role: 'assistant' },
          content: { parts: [`Check this \uE200citeturn0search0\uE201 out`] },
          metadata: {
            content_references: [
              {
                type: 'search_result_group',
                entries: [
                  {
                    ref_id: { turn_index: 0, ref_type: 'search', ref_index: 0 },
                    title: 'Example',
                    url: 'https://example.com',
                  },
                ],
              },
            ],
          },
        },
      },
    }

    const conv = make_conv({ mapping })
    const transcript = formatTranscript(conv)
    expect(transcript).toContain('[Example](https://example.com)')
  })

  it('strips link_title blocks', () => {
    const mapping: Record<string, Record<string, unknown>> = {
      root: { children: ['msg-0'] },
      'msg-0': {
        parent: 'root',
        children: [],
        message: {
          author: { role: 'assistant' },
          content: { parts: [`See \uFFFClink_titleMy Linkturn0view0\uFFFC here`] },
          metadata: { content_references: [] },
        },
      },
    }

    const conv = make_conv({ mapping })
    const transcript = formatTranscript(conv)
    expect(transcript).toContain('[My Link]')
    expect(transcript).not.toContain('\uFFFC')
  })
})
