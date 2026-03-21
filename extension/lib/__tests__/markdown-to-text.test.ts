/**
 * Unit tests for markdown-to-text.ts — markdownToText and prepareContent.
 */

import { describe, it, expect, vi } from 'vitest'

// Mock chrome APIs
vi.stubGlobal('chrome', {
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn(), remove: vi.fn() } },
  cookies: { get: vi.fn() },
  runtime: { sendMessage: vi.fn() },
})

import { markdownToText, prepareContent } from '../transform/markdown-to-text'
import type { IConversation } from '../interfaces/conversation'

describe('markdownToText', () => {
  it('converts basic markdown to plain text', () => {
    const result = markdownToText('**bold** text')
    expect(result).toContain('bold')
    expect(result).toContain('text')
    expect(result).not.toContain('**')
  })

  it('strips links leaving text only', () => {
    const result = markdownToText('[click here](https://example.com)')
    expect(result).toContain('click here')
    expect(result).not.toContain('https://example.com')
  })

  it('handles headings', () => {
    const result = markdownToText('# Title\n\nParagraph')
    expect(result.toLowerCase()).toContain('title')
    expect(result).toContain('Paragraph')
  })

  it('handles empty string', () => {
    expect(markdownToText('')).toBe('')
  })

  it('handles plain text passthrough', () => {
    expect(markdownToText('Just plain text')).toBe('Just plain text')
  })

  it('strips images', () => {
    const result = markdownToText('Before ![alt](image.png) After')
    expect(result).not.toContain('image.png')
    expect(result).toContain('Before')
    expect(result).toContain('After')
  })
})

describe('prepareContent', () => {
  it('converts conversation to plain text', () => {
    const conv = {
      id: 'c1',
      title: 'Test Conv',
      data: { id: 'c1', title: 'Test Conv', mapping: {} },
      messages: [
        { role: 'user', content: 'Hello **world**' },
        { role: 'assistant', content: 'Hi there' },
      ],
    } as unknown as IConversation

    const result = prepareContent(conv)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})
