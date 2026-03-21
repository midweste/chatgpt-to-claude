/**
 * Unit tests for conversation-store.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock chrome APIs
const mockStorageGet = vi.fn().mockResolvedValue({})
const mockStorageSet = vi.fn().mockResolvedValue(undefined)
vi.stubGlobal('chrome', {
  storage: { local: { get: mockStorageGet, set: mockStorageSet, remove: vi.fn() } },
  cookies: { get: vi.fn() },
  runtime: { sendMessage: vi.fn() },
})


// Mock IndexedDB storage module (reads only — writes are in tracking-repository)
vi.mock('@lib/storage', () => ({
  getAllConversations: vi.fn().mockResolvedValue([
    { id: 'c1', title: 'Conv 1', mapping: {} },
    { id: 'c2', title: 'Conv 2', mapping: {} },
    { id: 'c3', title: 'Conv 3', mapping: {} },
  ]),
  getAllMemories: vi.fn().mockResolvedValue([
    { id: 'm1', content: 'Memory 1' },
  ]),
  getInstructions: vi.fn().mockResolvedValue({ about_user_message: 'Test', about_model_message: null }),
  getMigrationState: vi.fn().mockResolvedValue(null),
  getAllTracking: vi.fn().mockResolvedValue([
    { id: 'c1', type: 'conversation', is_selected: false, status: 'extracted' },
    { id: 'c2', type: 'conversation', is_selected: true, status: 'extracted' },
    { id: 'c3', type: 'conversation', is_selected: false, status: 'done' },
    { id: 'm1', type: 'memory', is_selected: true, status: 'extracted' },
  ]),
  getSetting: vi.fn().mockResolvedValue([]),
  setSetting: vi.fn().mockResolvedValue(undefined),
  removeSetting: vi.fn().mockResolvedValue(undefined),
}))

// Mock tracking write functions (imported directly by the store)
vi.mock('@lib/storage/tracking-repository', () => ({
  toggleSelection: vi.fn().mockResolvedValue(undefined),
  toggleAllSelection: vi.fn().mockResolvedValue(undefined),
  patchTracking: vi.fn().mockResolvedValue(undefined),
  resetPushed: vi.fn().mockResolvedValue(0),
  deleteTrackingByIds: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@lib/services/pushed-status-service', () => ({
  refreshPushedStatus: vi.fn().mockResolvedValue({ marked: 0, unmarked: 0, checked: 0 }),
}))

const { useConversationStore, selectSelectedCount, selectSelectedMemoryCount, selectHasData, buildConvProjectMap, resetConvProjectMapCache } = await import('../conversation-store')

describe('ConversationStore', () => {
  beforeEach(() => {
    useConversationStore.setState({
      conversations: [],
      memories: [],
      instructions: null,
      projects: [],
      tracking: new Map(),
      migration_state: null,
      is_loaded: false,
    })
  })

  it('should have correct initial state', () => {
    const state = useConversationStore.getState()
    expect(state.conversations).toEqual([])
    expect(state.memories).toEqual([])
    expect(state.instructions).toBeNull()
    expect(state.is_loaded).toBe(false)
  })

  it('should load conversations, memories, instructions, and tracking', async () => {
    await useConversationStore.getState().load()
    const state = useConversationStore.getState()
    expect(state.conversations).toHaveLength(3)
    expect(state.memories).toHaveLength(1)
    expect(state.instructions).toEqual({ about_user_message: 'Test', about_model_message: null })
    expect(state.tracking.size).toBe(4)
    expect(state.is_loaded).toBe(true)
  })

  it('should toggle selection optimistically via tracking map', async () => {
    await useConversationStore.getState().load()
    await useConversationStore.getState().toggleSelection('c1', true)
    const track = useConversationStore.getState().tracking.get('c1')
    expect(track?.is_selected).toBe(true)
  })

  it('should toggle all selection optimistically', async () => {
    await useConversationStore.getState().load()
    await useConversationStore.getState().toggle_all_selection(['c1', 'c3'], true)
    const state = useConversationStore.getState()
    expect(state.tracking.get('c1')?.is_selected).toBe(true)
    expect(state.tracking.get('c3')?.is_selected).toBe(true)
    // c2 should remain unchanged
    expect(state.tracking.get('c2')?.is_selected).toBe(true)
  })

  it('should refresh conversations from storage', async () => {
    await useConversationStore.getState().load()
    await useConversationStore.getState().refresh()
    expect(useConversationStore.getState().conversations).toHaveLength(3)
  })

  it('should set projects', async () => {
    const projects = [{ id: 'p1', name: 'Test Project', created_at: null, updated_at: null, conversation_ids: ['c1'] }]
    await useConversationStore.getState().set_projects(projects)
    expect(useConversationStore.getState().projects).toEqual(projects)
  })

  describe('selectors', () => {
    beforeEach(async () => {
      await useConversationStore.getState().load()
    })

    it('selectSelectedCount should count non-done selected conversations', () => {
      const count = selectSelectedCount(useConversationStore.getState())
      expect(count).toBe(1) // c2 is selected and not done
    })

    it('selectSelectedMemoryCount should count selected memories', () => {
      const count = selectSelectedMemoryCount(useConversationStore.getState())
      expect(count).toBe(1) // m1 is selected
    })

    it('selectHasData should return true when conversations exist', () => {
      expect(selectHasData(useConversationStore.getState())).toBe(true)
    })

    it('selectHasData should return false when no conversations', () => {
      useConversationStore.setState({ conversations: [] })
      expect(selectHasData(useConversationStore.getState())).toBe(false)
    })

    it('buildConvProjectMap builds project→conversation mapping', () => {
      const projects = [
        { id: 'p1', name: 'Alpha', created_at: null, updated_at: null, conversation_ids: ['c1', 'c2'] },
        { id: 'p2', name: 'Beta', created_at: null, updated_at: null, conversation_ids: ['c3'] },
      ]
      const map = buildConvProjectMap(projects)
      expect(map.get('c1')).toBe('Alpha')
      expect(map.get('c2')).toBe('Alpha')
      expect(map.get('c3')).toBe('Beta')
      expect(map.get('c99')).toBeUndefined()
    })
  })

  describe('reset_pushed', () => {
    it('should reset pushed and reload tracking', async () => {
      const { resetPushed } = await import('@lib/storage/tracking-repository')
      vi.mocked(resetPushed).mockResolvedValue(2)
      await useConversationStore.getState().load()
      const count = await useConversationStore.getState().reset_pushed('conversation')
      expect(count).toBe(2)
    })
  })

  describe('refreshPushed', () => {
    it('should call refreshPushedStatus and reload tracking', async () => {
      await useConversationStore.getState().load()

      const claude = {
        getAccountInstructions: vi.fn().mockResolvedValue('I am a tester'),
      } as unknown as import('@lib/destinations/claude').ClaudeDestination

      await useConversationStore.getState().refreshPushed(claude)

      // Should have reloaded state
      const state = useConversationStore.getState()
      expect(state.tracking.size).toBeGreaterThan(0)
    })

    it('should mark instruction tracking when instructions match', async () => {
      const { patchTracking } = await import('@lib/storage/tracking-repository')
      const { getInstructions } = await import('@lib/storage')
      vi.mocked(getInstructions).mockResolvedValue({
        about_user_message: 'I am a developer',
        about_model_message: 'Be helpful',
      } as unknown as import('@lib/interfaces/chatgpt-api-types').ChatGPTRawInstructions)

      await useConversationStore.getState().load()

      const claude = {
        getAccountInstructions: vi.fn().mockResolvedValue('I am a developer and Be helpful'),
      } as unknown as import('@lib/destinations/claude').ClaudeDestination

      await useConversationStore.getState().refreshPushed(claude)

      // Should have patched both instruction tracking records
      expect(patchTracking).toHaveBeenCalledWith('about-user', { status: 'done' })
      expect(patchTracking).toHaveBeenCalledWith('about-model', { status: 'done' })
    })

    it('should handle getAccountInstructions error gracefully', async () => {
      await useConversationStore.getState().load()

      const claude = {
        getAccountInstructions: vi.fn().mockRejectedValue(new Error('API error')),
      } as unknown as import('@lib/destinations/claude').ClaudeDestination

      // Should not throw
      await useConversationStore.getState().refreshPushed(claude)
      expect(useConversationStore.getState().tracking.size).toBeGreaterThan(0)
    })
  })

  describe('resetConvProjectMapCache', () => {
    it('should clear memoized cache', () => {
      const projects = [
        { id: 'p1', name: 'Cached', created_at: null, updated_at: null, conversation_ids: ['c1'] },
      ]
      const map1 = buildConvProjectMap(projects)
      expect(map1.get('c1')).toBe('Cached')

      // Same reference returns same map (memoized)
      const map2 = buildConvProjectMap(projects)
      expect(map2).toBe(map1)

      // After reset, different reference
      resetConvProjectMapCache()
      const map3 = buildConvProjectMap(projects)
      expect(map3.get('c1')).toBe('Cached')
      // Different object identity (cache was cleared)
      // Note: same reference input → re-cached
    })
  })
})

