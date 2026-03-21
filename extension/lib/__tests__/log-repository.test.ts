/**
 * Unit tests for log-repository.ts — appendLog, getAllLogs, clearLogs.
 *
 * Uses fake-indexeddb for real IDB testing, same pattern as storage.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

// Mock chrome APIs (needed by storage module)
vi.stubGlobal('chrome', {
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn(), remove: vi.fn(), clear: vi.fn() } },
  cookies: { get: vi.fn() },
  runtime: { sendMessage: vi.fn() },
})

import { appendLog, getAllLogs, clearLogs } from '../storage/log-repository'
import type { LogEntry } from '../storage/types'

function makeLog(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level: 'info',
    source: 'extract',
    message: 'Test log message',
    ...overrides,
  }
}

describe('log-repository', () => {
  beforeEach(async () => {
    await clearLogs()
  })

  describe('appendLog', () => {
    it('adds a log entry', async () => {
      await appendLog(makeLog({ message: 'Hello' }))
      const logs = await getAllLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].message).toBe('Hello')
    })

    it('adds multiple entries', async () => {
      await appendLog(makeLog({ message: 'First' }))
      await appendLog(makeLog({ message: 'Second' }))
      await appendLog(makeLog({ message: 'Third' }))
      const logs = await getAllLogs()
      expect(logs).toHaveLength(3)
    })

    it('preserves all LogEntry fields', async () => {
      const entry = makeLog({
        level: 'error',
        source: 'connect',
        message: 'Connection failed',
        timestamp: '2024-06-15T12:00:00Z',
      })
      await appendLog(entry)
      const logs = await getAllLogs()
      expect(logs[0]).toMatchObject({
        level: 'error',
        source: 'connect',
        message: 'Connection failed',
        timestamp: '2024-06-15T12:00:00Z',
      })
    })
  })

  describe('getAllLogs', () => {
    it('returns empty array when no logs exist', async () => {
      expect(await getAllLogs()).toEqual([])
    })

    it('returns all stored logs', async () => {
      await appendLog(makeLog({ level: 'debug' }))
      await appendLog(makeLog({ level: 'warn' }))
      const logs = await getAllLogs()
      expect(logs).toHaveLength(2)
      expect(logs.map(l => l.level)).toContain('debug')
      expect(logs.map(l => l.level)).toContain('warn')
    })
  })

  describe('clearLogs', () => {
    it('removes all log entries', async () => {
      await appendLog(makeLog())
      await appendLog(makeLog())
      await clearLogs()
      expect(await getAllLogs()).toEqual([])
    })

    it('is idempotent on empty store', async () => {
      await clearLogs()
      expect(await getAllLogs()).toEqual([])
    })
  })
})
