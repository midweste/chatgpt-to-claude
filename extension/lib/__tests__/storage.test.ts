/**
 * Unit tests for storage.ts — full CRUD coverage for all object stores.
 *
 * Uses fake-indexeddb for testing the IndexedDB layer.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

// Mock chrome APIs
vi.stubGlobal('chrome', {
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn(), remove: vi.fn(), clear: vi.fn().mockResolvedValue(undefined) } },
  cookies: { get: vi.fn() },
  runtime: { sendMessage: vi.fn() },
})

import {
  // Conversations
  putConversation,
  putConversations,
  getConversation,
  getAllConversations,
  getConversationCount,
  // Memories
  putMemories,
  getAllMemories,
  // Instructions
  putInstructions,
  getInstructions,
  // Tracking (reads)
  getAllTracking,
  // Migration state
  getMigrationState,
  updateMigrationState,
  // Clear
  clearAll,
  clearConversations,
  clearMemories,
  clearInstructions,
  clearMigrationState,
  // Settings
  getSetting,
  setSetting,
  removeSetting,
  clearSettings,
} from '../storage'
import {
  putTracking,
  patchTracking,
  toggleSelection,
  toggleAllSelection,
  ensureTracking,
  resetPushed,
} from '../storage/tracking-repository'

function make_raw_conv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'c1',
    title: 'Test',
    create_time: null,
    update_time: null,
    current_node: null,
    mapping: {},
    ...overrides,
  }
}

describe('Storage — Conversations (raw)', () => {
  beforeEach(async () => {
    await clearConversations()
  })

  it('putConversation + getConversation round-trip', async () => {
    const conv = make_raw_conv({ id: 'c1', title: 'Hello' })
    await putConversation(conv)
    const result = await getConversation('c1')
    expect(result?.title).toBe('Hello')
  })

  it('getConversation returns undefined for missing id', async () => {
    const result = await getConversation('nonexistent')
    expect(result).toBeUndefined()
  })

  it('putConversations batch insert', async () => {
    const convs = [
      make_raw_conv({ id: 'c1' }),
      make_raw_conv({ id: 'c2' }),
      make_raw_conv({ id: 'c3' }),
    ]
    await putConversations(convs)
    const all = await getAllConversations()
    expect(all).toHaveLength(3)
  })

  it('getAllConversations returns empty array initially', async () => {
    const all = await getAllConversations()
    expect(all).toEqual([])
  })

  it('getConversationCount returns correct count', async () => {
    await putConversations([make_raw_conv({ id: 'a' }), make_raw_conv({ id: 'b' })])
    expect(await getConversationCount()).toBe(2)
  })

  it('clearConversations empties the store', async () => {
    await putConversations([make_raw_conv({ id: 'a' }), make_raw_conv({ id: 'b' })])
    await clearConversations()
    expect(await getConversationCount()).toBe(0)
  })
})

describe('Storage — Tracking', () => {
  beforeEach(async () => {
    await clearConversations()
  })

  it('ensureTracking creates tracking records with defaults', async () => {
    await ensureTracking([
      { id: 'c1', type: 'conversation' },
      { id: 'c2', type: 'conversation' },
    ])
    const all = await getAllTracking()
    expect(all).toHaveLength(2)
    expect(all[0].is_selected).toBe(false)
    expect(all[0].status).toBe('pending')
  })

  it('ensureTracking does not overwrite existing records', async () => {
    await putTracking({ id: 'c1', type: 'conversation', is_selected: false, status: 'done' })
    await ensureTracking([{ id: 'c1', type: 'conversation' }])
    const all = await getAllTracking()
    expect(all).toHaveLength(1)
    expect(all[0].is_selected).toBe(false) // not overwritten
    expect(all[0].status).toBe('done') // not overwritten
  })

  it('patchTracking merges fields', async () => {
    await putTracking({ id: 'c1', type: 'conversation', is_selected: true, status: 'extracted' })
    await patchTracking('c1', { status: 'done', claude_id: 'uuid-1' })
    const all = await getAllTracking()
    const record = all.find((t) => t.id === 'c1')
    expect(record?.status).toBe('done')
    expect(record?.claude_id).toBe('uuid-1')
    expect(record?.is_selected).toBe(true) // untouched
  })

  it('toggleSelection updates is_selected', async () => {
    await putTracking({ id: 'c1', type: 'conversation', is_selected: false, status: 'extracted' })
    await toggleSelection('c1', true)
    const all = await getAllTracking()
    expect(all[0].is_selected).toBe(true)
  })

  it('toggleAllSelection sets multiple', async () => {
    await putTracking({ id: 'a', type: 'conversation', is_selected: false, status: 'extracted' })
    await putTracking({ id: 'b', type: 'conversation', is_selected: false, status: 'extracted' })
    await toggleAllSelection(['a', 'b'], true)
    const all = await getAllTracking()
    expect(all.every((t) => t.is_selected)).toBe(true)
  })

  it('resetPushed returns done to extracted', async () => {
    await putTracking({ id: 'c1', type: 'conversation', is_selected: true, status: 'done' })
    await putTracking({ id: 'c2', type: 'conversation', is_selected: true, status: 'done' })
    await putTracking({ id: 'c3', type: 'conversation', is_selected: true, status: 'extracted' })
    const count = await resetPushed('conversation')
    expect(count).toBe(2)
    const all = await getAllTracking()
    expect(all.every((t) => t.status === 'extracted')).toBe(true)
  })

  it('resetPushed returns 0 when none pushed', async () => {
    await putTracking({ id: 'c1', type: 'conversation', is_selected: true, status: 'extracted' })
    expect(await resetPushed('conversation')).toBe(0)
  })
})

describe('Storage — Memories (raw)', () => {
  beforeEach(async () => {
    await clearMemories()
  })

  it('putMemories + getAllMemories round-trip', async () => {
    await putMemories([
      { id: 'm1', content: 'Remember this' },
      { id: 'm2', content: 'And this', status: 'warm', source_conversation_id: 'c1', create_time: '2024-01-01' },
    ])
    const all = await getAllMemories()
    expect(all).toHaveLength(2)
    expect(all.find((m) => m.id === 'm2')?.status).toBe('warm')
  })

  it('getAllMemories returns empty initially', async () => {
    expect(await getAllMemories()).toEqual([])
  })

  it('clearMemories empties the store', async () => {
    await putMemories([{ id: 'm1', content: 'Test' }])
    await clearMemories()
    expect(await getAllMemories()).toEqual([])
  })
})

describe('Storage — Instructions (raw)', () => {
  beforeEach(async () => {
    await clearInstructions()
  })

  it('putInstructions + getInstructions round-trip', async () => {
    await putInstructions({ about_user_message: 'I am a developer', about_model_message: 'Be concise', custom: true })
    const result = await getInstructions()
    expect(result?.about_user_message).toBe('I am a developer')
    expect(result?.about_model_message).toBe('Be concise')
  })

  it('getInstructions returns null when empty', async () => {
    expect(await getInstructions()).toBeNull()
  })

  it('clearInstructions empties the store', async () => {
    await putInstructions({ about_user_message: 'Test', about_model_message: null })
    await clearInstructions()
    expect(await getInstructions()).toBeNull()
  })
})

describe('Storage — Migration State', () => {
  beforeEach(async () => {
    await clearMigrationState()
  })

  it('getMigrationState returns null initially', async () => {
    expect(await getMigrationState()).toBeNull()
  })

  it('updateMigrationState creates state with defaults', async () => {
    await updateMigrationState({ status: 'downloading' })
    const state = await getMigrationState()
    expect(state?.status).toBe('downloading')
    expect(state?.source).toBe('chatgpt')
    expect(state?.total_conversations).toBe(0)
  })

  it('updateMigrationState merges with existing state', async () => {
    await updateMigrationState({ status: 'downloading', total_conversations: 100 })
    await updateMigrationState({ extracted_count: 50 })
    const state = await getMigrationState()
    expect(state?.status).toBe('downloading') // preserved
    expect(state?.total_conversations).toBe(100) // preserved
    expect(state?.extracted_count).toBe(50) // updated
  })

  it('clearMigrationState empties the store', async () => {
    await updateMigrationState({ status: 'downloading' })
    await clearMigrationState()
    expect(await getMigrationState()).toBeNull()
  })
})

describe('Storage — Settings', () => {
  beforeEach(async () => {
    await clearSettings()
  })

  it('getSetting returns fallback when key missing', async () => {
    expect(await getSetting('nope', 'default')).toBe('default')
  })

  it('setSetting + getSetting round-trip', async () => {
    await setSetting('theme', 'dark')
    expect(await getSetting('theme', 'light')).toBe('dark')
  })

  it('removeSetting deletes a key', async () => {
    await setSetting('key', 42)
    await removeSetting('key')
    expect(await getSetting('key', 0)).toBe(0)
  })

  it('clearSettings removes all', async () => {
    await setSetting('a', 1)
    await setSetting('b', 2)
    await clearSettings()
    expect(await getSetting('a', 0)).toBe(0)
    expect(await getSetting('b', 0)).toBe(0)
  })
})

describe('Storage — clearAll', () => {
  it('clears conversations, memories, instructions, and migration state', async () => {
    await putConversation(make_raw_conv({ id: 'c1' }))
    await putMemories([{ id: 'm1', content: 'Hi' }])
    await putInstructions({ about_user_message: 'Test', about_model_message: null })
    await updateMigrationState({ status: 'downloading' })

    await clearAll()

    expect(await getAllConversations()).toEqual([])
    expect(await getAllMemories()).toEqual([])
    expect(await getInstructions()).toBeNull()
    expect(await getMigrationState()).toBeNull()
  })
})
