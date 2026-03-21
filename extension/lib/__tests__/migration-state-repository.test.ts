/**
 * Unit tests for migration-state-repository.ts — getMigrationState, updateMigrationState, clearMigrationState.
 *
 * Uses fake-indexeddb for real IDB testing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

// Mock chrome APIs (needed by storage module)
vi.stubGlobal('chrome', {
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn(), remove: vi.fn(), clear: vi.fn() } },
  cookies: { get: vi.fn() },
  runtime: { sendMessage: vi.fn() },
})

import { getMigrationState, updateMigrationState, clearMigrationState } from '../storage/migration-state-repository'

describe('migration-state-repository', () => {
  beforeEach(async () => {
    await clearMigrationState()
  })

  describe('getMigrationState', () => {
    it('returns null when no state exists', async () => {
      expect(await getMigrationState()).toBeNull()
    })

    it('returns state after it has been set', async () => {
      await updateMigrationState({ status: 'downloading' })
      const state = await getMigrationState()
      expect(state).not.toBeNull()
      expect(state?.status).toBe('downloading')
    })
  })

  describe('updateMigrationState', () => {
    it('creates state with defaults', async () => {
      await updateMigrationState({ status: 'downloading' })
      const state = await getMigrationState()
      expect(state?.id).toBe('current')
      expect(state?.source).toBe('chatgpt')
      expect(state?.status).toBe('downloading')
      expect(state?.total_conversations).toBe(0)
      expect(state?.extracted_count).toBe(0)
      expect(state?.last_offset).toBe(0)
    })

    it('merges partial updates with existing state', async () => {
      await updateMigrationState({ status: 'downloading', total_conversations: 100 })
      await updateMigrationState({ extracted_count: 50 })
      const state = await getMigrationState()
      expect(state?.status).toBe('downloading') // preserved from first call
      expect(state?.total_conversations).toBe(100) // preserved
      expect(state?.extracted_count).toBe(50) // updated
    })

    it('overwrites existing fields', async () => {
      await updateMigrationState({ status: 'downloading' })
      await updateMigrationState({ status: 'complete' })
      const state = await getMigrationState()
      expect(state?.status).toBe('complete')
    })
  })

  describe('clearMigrationState', () => {
    it('removes all state', async () => {
      await updateMigrationState({ status: 'downloading', total_conversations: 50 })
      await clearMigrationState()
      expect(await getMigrationState()).toBeNull()
    })

    it('is idempotent on empty store', async () => {
      await clearMigrationState()
      expect(await getMigrationState()).toBeNull()
    })
  })
})
