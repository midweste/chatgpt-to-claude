/**
 * Unit tests for app-store.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock chrome APIs before importing the store
const mockGet = vi.fn()
const mockSet = vi.fn()
vi.stubGlobal('chrome', {
  storage: { local: { get: mockGet, set: mockSet, remove: vi.fn() } },
  cookies: { get: vi.fn() },
  runtime: { sendMessage: vi.fn() },
})

// Mock ChatGPTSource — constructor creates instances inside the store actions
const mockAuthenticate = vi.fn().mockResolvedValue(undefined)
const mockRestoreSession = vi.fn().mockResolvedValue(false)
vi.mock('@lib/sources/chatgpt', () => ({
  ChatGPTSource: vi.fn().mockImplementation(() => ({
    authenticate: mockAuthenticate,
    restoreSession: mockRestoreSession,
  })),
}))

vi.mock('@lib/logger', () => ({
  logger: {
    info: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
    error: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@lib/storage', () => ({
  getSetting: vi.fn().mockResolvedValue(null),
  setSetting: vi.fn().mockResolvedValue(undefined),
  removeSetting: vi.fn().mockResolvedValue(undefined),
}))

// Must import AFTER mocking chrome
const { useAppStore } = await import('../app-store')

describe('AppStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset store state
    useAppStore.setState({
      page: 'connect',
      is_connected: false,
      gpt_status: 'loading',
      gpt_error: '',
    })
  })

  it('should have correct initial state', () => {
    const state = useAppStore.getState()
    expect(state.page).toBe('connect')
    expect(state.is_connected).toBe(false)
    expect(state.gpt_status).toBe('loading')
    expect(state.gpt_error).toBe('')
  })

  it('should set page', () => {
    useAppStore.getState().setPage('conversations')
    expect(useAppStore.getState().page).toBe('conversations')
  })

  it('should set connected', () => {
    useAppStore.getState().set_connected(true)
    expect(useAppStore.getState().is_connected).toBe(true)
  })

  it('should navigate to connect when disconnected', () => {
    useAppStore.setState({ page: 'conversations', is_connected: true })
    useAppStore.getState().set_connected(false)
    expect(useAppStore.getState().page).toBe('connect')
    expect(useAppStore.getState().is_connected).toBe(false)
  })

  it('should not change page when connected', () => {
    useAppStore.setState({ page: 'conversations' })
    useAppStore.getState().set_connected(true)
    expect(useAppStore.getState().page).toBe('conversations')
  })

  // ── Async methods ──

  it('should restore session when token is valid', async () => {
    mockRestoreSession.mockResolvedValueOnce(true)
    await useAppStore.getState().restoreSession()
    const state = useAppStore.getState()
    expect(state.is_connected).toBe(true)
    expect(state.gpt_status).toBe('connected')
  })

  it('should set idle when session restore fails', async () => {
    mockRestoreSession.mockResolvedValueOnce(false)
    await useAppStore.getState().restoreSession()
    const state = useAppStore.getState()
    expect(state.is_connected).toBe(false)
    expect(state.gpt_status).toBe('idle')
  })

  it('should connect to GPT successfully', async () => {
    mockAuthenticate.mockResolvedValueOnce(undefined)
    await useAppStore.getState().connect_gpt()
    const state = useAppStore.getState()
    expect(state.gpt_status).toBe('connected')
    expect(state.is_connected).toBe(true)
  })

  it('should set error when connect_gpt fails', async () => {
    mockAuthenticate.mockRejectedValueOnce(new Error('Network error'))
    await useAppStore.getState().connect_gpt()
    const state = useAppStore.getState()
    expect(state.gpt_status).toBe('error')
    expect(state.gpt_error).toContain('Network error')
  })

  it('should disconnect from GPT', async () => {
    useAppStore.setState({ is_connected: true, gpt_status: 'connected' })
    await useAppStore.getState().disconnect_gpt()
    const state = useAppStore.getState()
    expect(state.gpt_status).toBe('idle')
    expect(state.is_connected).toBe(false)
  })
})
