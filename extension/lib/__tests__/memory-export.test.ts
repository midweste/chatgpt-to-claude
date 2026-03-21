/**
 * Unit tests for memory-export.ts — buildMemoryImportPrompt.
 *
 * Validates prompt structure, memory formatting, date handling,
 * and multi-memory separator behavior.
 */

import { describe, it, expect } from 'vitest'
import { buildMemoryImportPrompt } from '../transform/memory-export'
import type { IMemory } from '../interfaces/memory'
import type { ChatGPTRawMemory } from '../interfaces/chatgpt-api-types'

function makeMemory(overrides: Partial<IMemory> & { content?: string; created_at?: string | null } = {}): IMemory {
  const raw: ChatGPTRawMemory = { id: 'm1', content: overrides.content ?? 'Test memory content' }
  return {
    data: raw,
    id: 'm1',
    content: 'Test memory content',
    created_at: '2024-06-15T12:00:00Z',
    ...overrides,
  }
}

describe('buildMemoryImportPrompt', () => {
  it('includes memory count in the prompt header', () => {
    const memories = [makeMemory(), makeMemory({ id: 'm2', content: 'Second' })]
    const result = buildMemoryImportPrompt(memories)
    expect(result).toContain('all 2 memories')
    expect(result).toContain('2 total')
  })

  it('formats memories with ISO date', () => {
    const result = buildMemoryImportPrompt([
      makeMemory({ content: 'I like TypeScript', created_at: '2024-03-10T08:00:00Z' }),
    ])
    expect(result).toContain('### Memory [2024-03-10]')
    expect(result).toContain('I like TypeScript')
  })

  it('uses "unknown" for memories without a date', () => {
    const result = buildMemoryImportPrompt([
      makeMemory({ content: 'No date memory', created_at: undefined }),
    ])
    expect(result).toContain('### Memory [unknown]')
    expect(result).toContain('No date memory')
  })

  it('separates multiple memories with horizontal rules', () => {
    const memories = [
      makeMemory({ id: 'm1', content: 'First' }),
      makeMemory({ id: 'm2', content: 'Second' }),
    ]
    const result = buildMemoryImportPrompt(memories)
    expect(result).toContain('---')
    // Both entries present
    expect(result).toContain('First')
    expect(result).toContain('Second')
  })

  it('includes all required prompt sections', () => {
    const result = buildMemoryImportPrompt([makeMemory()])
    expect(result).toContain('## Categories')
    expect(result).toContain('## Rules:')
    expect(result).toContain('## Format:')
    expect(result).toContain('## Output:')
    expect(result).toContain('## Raw Memories')
    // Category names
    expect(result).toContain('Instructions')
    expect(result).toContain('Identity')
    expect(result).toContain('Career')
    expect(result).toContain('Projects')
    expect(result).toContain('Preferences')
  })

  it('preserves memory content verbatim', () => {
    const content = 'Uses dosage 500mg daily; server runs on port 3000; prefers `const` over `let`'
    const result = buildMemoryImportPrompt([makeMemory({ content })])
    expect(result).toContain(content)
  })

  it('handles empty memories array', () => {
    const result = buildMemoryImportPrompt([])
    expect(result).toContain('all 0 memories')
    expect(result).toContain('0 total')
  })

  it('handles single memory without separators', () => {
    const result = buildMemoryImportPrompt([makeMemory({ content: 'Only one' })])
    const rawSection = result.split('## Raw Memories')[1]
    // Only one memory – no "---" separator within the raw section content
    const memoryContent = rawSection.split('\n\n').filter(l => l.trim() === '---')
    expect(memoryContent).toHaveLength(0)
  })
})
