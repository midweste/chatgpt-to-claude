/**
 * Unit tests for export-service.ts — exportAll (zipped) and exportConversations (single-file).
 */

import { describe, it, expect, vi } from 'vitest'
import JSZip from 'jszip'

vi.mock('../transform/gpt-to-claude', () => ({
  formatTranscript: vi.fn().mockReturnValue('Transcript content'),
}))

import { exportAll, exportConversations } from '../services/export-service'
import type { ExportData } from '../services/export-service'

// ── Helpers ──

function make_raw_conv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'c1',
    title: 'Test Conversation',
    create_time: '2024-01-15T10:00:00Z',
    update_time: null,
    current_node: null,
    mapping: {},
    ...overrides,
  }
}

function make_raw_memory(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'm1',
    content: 'I like cats',
    status: 'warm',
    create_time: '2024-01-15T10:00:00Z',
    ...overrides,
  }
}

function make_raw_instructions(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    about_user_message: 'I am a developer',
    about_model_message: 'Be concise',
    ...overrides,
  }
}

function make_data(overrides: Partial<ExportData> = {}): ExportData {
  return {
    conversations: [make_raw_conv()],
    memories: [make_raw_memory()],
    instructions: make_raw_instructions(),
    ...overrides,
  }
}

async function unzip(blob: Blob): Promise<JSZip> {
  const buffer = await blob.arrayBuffer()
  return JSZip.loadAsync(buffer)
}

// ── exportAll — JSON format ──

describe('exportAll — JSON format', () => {
  it('should create conversations.json, memories.json, instructions.json', async () => {
    const blob = await exportAll(make_data(), 'json')
    const zip = await unzip(blob)

    const files = Object.keys(zip.files)
    expect(files).toContain('conversations.json')
    expect(files).toContain('memories.json')
    expect(files).toContain('instructions.json')
  })

  it('should serialize conversations as raw objects', async () => {
    const blob = await exportAll(make_data(), 'json')
    const zip = await unzip(blob)
    const raw = await zip.file('conversations.json')!.async('string')
    const parsed = JSON.parse(raw)

    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe('c1')
    expect(parsed[0].title).toBe('Test Conversation')
  })

  it('should serialize memories as raw objects', async () => {
    const blob = await exportAll(make_data(), 'json')
    const zip = await unzip(blob)
    const raw = await zip.file('memories.json')!.async('string')
    const parsed = JSON.parse(raw)

    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe('m1')
    expect(parsed[0].content).toBe('I like cats')
  })

  it('should handle null instructions', async () => {
    const blob = await exportAll(make_data({ instructions: null }), 'json')
    const zip = await unzip(blob)
    const raw = await zip.file('instructions.json')!.async('string')
    const parsed = JSON.parse(raw)

    expect(parsed).toEqual({})
  })
})

// ── exportAll — Text format ──

describe('exportAll — Text format', () => {
  it('should create conversations/ folder with .txt files', async () => {
    const blob = await exportAll(make_data(), 'text')
    const zip = await unzip(blob)

    const conv_files = Object.keys(zip.files).filter((f) => f.startsWith('conversations/') && !f.endsWith('/'))
    expect(conv_files.length).toBeGreaterThanOrEqual(1)
    expect(conv_files[0]).toMatch(/\.txt$/)
  })

  it('should create memories/ folder with numbered files', async () => {
    const data = make_data({ memories: [make_raw_memory(), make_raw_memory({ id: 'm2', content: 'I like dogs' })] })
    const blob = await exportAll(data, 'text')
    const zip = await unzip(blob)

    const mem_files = Object.keys(zip.files).filter((f) => f.startsWith('memories/') && !f.endsWith('/'))
    expect(mem_files).toHaveLength(2)
    // Files now use date-prefix naming: {date}_memory-{idx}.txt
    expect(mem_files[0]).toMatch(/^memories\/.*memory-001\.txt$/)
    expect(mem_files[1]).toMatch(/^memories\/.*memory-002\.txt$/)
  })

  it('should create instructions/ folder with about-you and response-style', async () => {
    const blob = await exportAll(make_data(), 'text')
    const zip = await unzip(blob)

    expect(zip.file('instructions/about-you.txt')).not.toBeNull()
    expect(zip.file('instructions/response-style.txt')).not.toBeNull()
  })

  it('should skip memories folder when empty', async () => {
    const blob = await exportAll(make_data({ memories: [] }), 'text')
    const zip = await unzip(blob)

    const mem_files = Object.keys(zip.files).filter((f) => f.startsWith('memories/'))
    expect(mem_files).toHaveLength(0)
  })

  it('should skip instructions folder when null', async () => {
    const blob = await exportAll(make_data({ instructions: null }), 'text')
    const zip = await unzip(blob)

    const inst_files = Object.keys(zip.files).filter((f) => f.startsWith('instructions/'))
    expect(inst_files).toHaveLength(0)
  })

  it('should sanitize conversation titles for filenames', async () => {
    const conv = make_raw_conv({ title: 'Hello: World / Test <file>' })
    const blob = await exportAll(make_data({ conversations: [conv] }), 'text')
    const zip = await unzip(blob)

    const conv_files = Object.keys(zip.files).filter((f) => f.startsWith('conversations/') && f.endsWith('.txt'))
    const basename = conv_files[0].replace('conversations/', '')
    expect(basename).not.toContain(':')
    expect(basename).not.toContain('<')
    expect(basename).not.toContain('>')
  })

  it('should deduplicate names when conversations have same title', async () => {
    const convs = [
      make_raw_conv({ id: 'c1', title: 'Hello' }),
      make_raw_conv({ id: 'c2', title: 'Hello' }),
    ]
    const blob = await exportAll(make_data({ conversations: convs }), 'text')
    const zip = await unzip(blob)

    const conv_files = Object.keys(zip.files).filter((f) => f.startsWith('conversations/') && f.endsWith('.txt'))
    expect(conv_files).toHaveLength(2)
    expect(new Set(conv_files).size).toBe(2) // no duplicates
  })

  it('should handle empty conversation title', async () => {
    const conv = make_raw_conv({ title: '' })
    const blob = await exportAll(make_data({ conversations: [conv] }), 'text')
    const zip = await unzip(blob)

    const conv_files = Object.keys(zip.files).filter((f) => f.startsWith('conversations/') && f.endsWith('.txt'))
    expect(conv_files.length).toBe(1)
  })

  it('should skip about_model when null', async () => {
    const data = make_data({ instructions: make_raw_instructions({ about_model_message: null }) })
    const blob = await exportAll(data, 'text')
    const zip = await unzip(blob)

    expect(zip.file('instructions/about-you.txt')).not.toBeNull()
    expect(zip.file('instructions/response-style.txt')).toBeNull()
  })
})

// ── exportConversations (non-zipped) ──

describe('exportConversations', () => {
  it('should export single conversation as text', () => {
    const conv = make_raw_conv()
    const result = exportConversations([conv], 'text')
    expect(result.name).toContain('Test Conversation')
    expect(result.content).toBe('Transcript content')
  })

  it('should export single conversation as JSON', () => {
    const conv = make_raw_conv()
    const result = exportConversations([conv], 'json')
    expect(result.name).toContain('.json')
    const parsed = JSON.parse(result.content)
    expect(parsed.id).toBe('c1')
    expect(parsed.title).toBe('Test Conversation')
  })

  it('should combine multiple conversations as JSON array', () => {
    const convs = [
      make_raw_conv({ id: 'c1', title: 'First' }),
      make_raw_conv({ id: 'c2', title: 'Second' }),
    ]
    const result = exportConversations(convs, 'json')
    expect(result.name).toBe('chatgpt-export.json')
    const parsed = JSON.parse(result.content)
    expect(parsed).toHaveLength(2)
  })

  it('should use Untitled when title is empty', () => {
    const conv = make_raw_conv({ title: '' })
    const result = exportConversations([conv], 'text')
    expect(result.name).toContain('Untitled')
  })
})
