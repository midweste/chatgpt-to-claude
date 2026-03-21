/**
 * Unit tests for extraction-service.ts — the 5-phase download orchestrator.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock storage module
vi.mock('../storage', () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  putConversations: vi.fn(),
  putMemories: vi.fn(),
  putInstructions: vi.fn(),
  getAllConversations: vi.fn(),
  getAllMemories: vi.fn(),
  updateMigrationState: vi.fn(),
  deleteConversationsByIds: vi.fn(),
}))

vi.mock('../storage/tracking-repository', () => ({
  ensureTracking: vi.fn(),
  deleteTrackingByIds: vi.fn(),
}))

// Mock logger
vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock ChatGPTSource
const mockSource = {
  restoreSession: vi.fn(),
  authenticate: vi.fn(),
  getProjects: vi.fn(),
  listConversations: vi.fn(),
  downloadAll: vi.fn(),
  getMemories: vi.fn(),
  getInstructions: vi.fn(),
}

vi.mock('../sources/chatgpt', () => ({
  ChatGPTSource: vi.fn(() => mockSource),
}))

// Stub chrome
vi.stubGlobal('chrome', {
  runtime: { sendMessage: vi.fn() },
  storage: { local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() } },
  cookies: { get: vi.fn() },
})

import {
  loadLastExtraction,
  runExtraction,
  type ExtractionSummary,
  type ExtractionProgress,
  type ExtractionCounts,
} from '../services/extraction-service'
import {
  getSetting,
  setSetting,
  putConversations,
  putMemories,
  putInstructions,
  getAllConversations,
  getAllMemories,
  updateMigrationState,
} from '../storage'
import { ensureTracking } from '../storage/tracking-repository'

describe('loadLastExtraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns stored summary when available', async () => {
    const summary: ExtractionSummary = {
      conversations: 10,
      newConversations: 5,
      projectConversations: 2,
      newProjectConversations: 1,
      memories: 3,
      newMemories: 1,
      projects: 2,
      newProjects: 0,
      instructions: 2,
      newInstructions: 2,
      completedAt: '2024-01-01T00:00:00Z',
    }
    ;(getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(summary)

    const result = await loadLastExtraction()
    expect(result).toEqual(summary)
  })

  it('returns null when no summary stored', async () => {
    ;(getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    expect(await loadLastExtraction()).toBeNull()
  })

  it('returns null on error', async () => {
    ;(getSetting as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'))
    expect(await loadLastExtraction()).toBeNull()
  })
})

describe('runExtraction', () => {
  let progressCalls: ExtractionProgress[]
  let countUpdates: Array<(prev: ExtractionCounts) => ExtractionCounts>
  const callbacks = {
    on_progress: (p: ExtractionProgress) => progressCalls.push(p),
    on_counts: (updater: (prev: ExtractionCounts) => ExtractionCounts) => countUpdates.push(updater),
  }

  const baseCounts: ExtractionCounts = {
    projects: 0, newProjects: 0,
    projectConversations: 0, newProjectConversations: 0,
    conversations: 0, newConversations: 0,
    memories: 0, newMemories: 0,
    instructions: 0, newInstructions: 0,
    phase: '',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    progressCalls = []
    countUpdates = []

    // Default mocks for a minimal extraction
    mockSource.restoreSession.mockResolvedValue(true)
    mockSource.authenticate.mockResolvedValue(undefined)
    mockSource.getProjects.mockResolvedValue([])
    ;(getSetting as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(setSetting as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    ;(getAllConversations as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(getAllMemories as ReturnType<typeof vi.fn>).mockResolvedValue([])

    // listConversations returns an async generator
    mockSource.listConversations.mockImplementation(async function* () {
      yield [
        { id: 'conv-1', title: 'Chat 1', created_at: null, updated_at: null, model: null, project_id: null, is_archived: false },
      ]
    })
    mockSource.downloadAll.mockResolvedValue([
      {
        id: 'conv-1', title: 'Chat 1', created_at: null, updated_at: null,
        model: null, project_id: null, is_archived: false,
        raw_mapping: {}, message_count: 5,
      },
    ])
    mockSource.getMemories.mockResolvedValue([])
    mockSource.getInstructions.mockResolvedValue(null)
    ;(putConversations as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    ;(putMemories as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    ;(putInstructions as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    ;(updateMigrationState as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    ;(ensureTracking as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  })

  it('restores session or authenticates', async () => {
    mockSource.restoreSession.mockResolvedValue(true)
    await runExtraction(callbacks)
    expect(mockSource.restoreSession).toHaveBeenCalled()
    expect(mockSource.authenticate).not.toHaveBeenCalled()
  })

  it('falls back to authenticate when session restore fails', async () => {
    mockSource.restoreSession.mockResolvedValue(false)
    await runExtraction(callbacks)
    expect(mockSource.authenticate).toHaveBeenCalled()
  })

  it('fetches and stores projects', async () => {
    mockSource.getProjects.mockResolvedValue([
      { id: 'p1', name: 'Project 1', created_at: null, updated_at: null, conversation_ids: ['c1'] },
    ])
    ;(getSetting as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]) // old projects
      .mockResolvedValueOnce([]) // projects for save

    await runExtraction(callbacks)

    expect(setSetting).toHaveBeenCalledWith('projects', expect.arrayContaining([
      expect.objectContaining({ id: 'p1' }),
    ]))
    // Check project count was updated
    const projectUpdate = countUpdates.find((u) => u(baseCounts).projects === 1)
    expect(projectUpdate).toBeDefined()
  })

  it('downloads new conversations', async () => {
    await runExtraction(callbacks)

    expect(mockSource.downloadAll).toHaveBeenCalled()
    expect(putConversations).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'conv-1' })]),
    )
    expect(ensureTracking).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'conv-1', type: 'conversation' })]),
    )
  })

  it('skips already-stored conversations', async () => {
    ;(getAllConversations as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'conv-1', title: 'Already Here' },
    ])

    await runExtraction(callbacks)

    // downloadAll shouldn't be called for main convs (no new IDs)
    expect(mockSource.downloadAll).not.toHaveBeenCalled()
  })

  it('fetches and stores memories', async () => {
    mockSource.getMemories.mockResolvedValue([
      { id: 'm1', content: 'Remember this', status: 'warm', source_conv_id: null, created_at: null },
    ])

    await runExtraction(callbacks)

    expect(putMemories).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'm1' })]),
    )
  })

  it('fetches and stores instructions', async () => {
    mockSource.getInstructions.mockResolvedValue({
      about_user_message: 'I am a developer',
      about_model_message: 'Be concise',
    })

    await runExtraction(callbacks)

    expect(putInstructions).toHaveBeenCalledWith(
      expect.objectContaining({ about_user_message: 'I am a developer' }),
    )
  })

  it('saves extraction summary', async () => {
    const result = await runExtraction(callbacks)

    expect(result.conversations).toBeGreaterThanOrEqual(0)
    expect(result.completedAt).toBeTruthy()
    expect(setSetting).toHaveBeenCalledWith(
      'aimigration_last_extraction',
      expect.objectContaining({ completedAt: expect.any(String) }),
    )
  })

  it('updates migration state on completion', async () => {
    await runExtraction(callbacks)

    expect(updateMigrationState).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'complete' }),
    )
  })

  it('returns a complete ExtractionSummary', async () => {
    mockSource.getMemories.mockResolvedValue([
      { id: 'm1', content: 'Test', status: null, source_conv_id: null, created_at: null },
    ])
    mockSource.getInstructions.mockResolvedValue({
      about_user_message: 'Dev', about_model_message: null,
    })

    const result = await runExtraction(callbacks)
    expect(result).toMatchObject({
      conversations: 1,
      memories: 1,
      instructions: 1,
      completedAt: expect.any(String),
    })
  })
})
