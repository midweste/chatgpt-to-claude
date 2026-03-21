/**
 * Unit tests for SSE response parser.
 */

import { describe, it, expect } from 'vitest'
import { parseSSEResponse } from '../utils/sse-parser'

describe('parseSSEResponse', () => {
  it('extracts message text from a valid SSE stream', () => {
    const raw = [
      'data: {"message":{"content":{"parts":["Hello"]}}}',
      'data: {"message":{"content":{"parts":["Hello world"]}}}',
      'data: [DONE]',
    ].join('\n')

    expect(parseSSEResponse(raw)).toBe('Hello world')
  })

  it('walks backward to find the last message', () => {
    const raw = [
      'data: {"message":{"content":{"parts":["First"]}}}',
      'data: {"message":{"content":{"parts":[""]}}}',
      'data: {"message":{"content":{"parts":["Last valid"]}}}',
      'data: {"message":{"id":"no-parts"}}',
      'data: [DONE]',
    ].join('\n')

    expect(parseSSEResponse(raw)).toBe('Last valid')
  })

  it('joins multi-part content', () => {
    const raw = [
      'data: {"message":{"content":{"parts":["Part 1","Part 2"]}}}',
      'data: [DONE]',
    ].join('\n')

    expect(parseSSEResponse(raw)).toBe('Part 1\nPart 2')
  })

  it('throws when no message content is found', () => {
    const raw = 'data: [DONE]\n'
    expect(() => parseSSEResponse(raw)).toThrow('Could not extract response')
  })

  it('throws for empty input', () => {
    expect(() => parseSSEResponse('')).toThrow('Could not extract response')
  })

  it('skips non-data lines', () => {
    const raw = [
      ':heartbeat',
      '',
      'data: {"message":{"content":{"parts":["OK"]}}}',
      '',
      'data: [DONE]',
    ].join('\n')

    expect(parseSSEResponse(raw)).toBe('OK')
  })

  it('skips unparseable JSON lines', () => {
    const raw = [
      'data: {invalid json',
      'data: {"message":{"content":{"parts":["Valid"]}}}',
      'data: [DONE]',
    ].join('\n')

    expect(parseSSEResponse(raw)).toBe('Valid')
  })

  it('skips messages with empty string parts', () => {
    const raw = [
      'data: {"message":{"content":{"parts":["  "]}}}',
      'data: {"message":{"content":{"parts":["Real content"]}}}',
      'data: [DONE]',
    ].join('\n')

    // The trimmed whitespace-only part should be skipped
    expect(parseSSEResponse(raw)).toBe('Real content')
  })
})
