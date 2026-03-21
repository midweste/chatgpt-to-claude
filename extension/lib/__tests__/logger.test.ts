/**
 * Unit tests for logger.ts — IndexedDB-backed log system.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// In-memory log store for mocked storage
let mockLogs: Array<{ timestamp: string; level: string; source: string; message: string }> = []

vi.stubGlobal('chrome', {
  storage: { local: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), clear: vi.fn() } },
  cookies: { get: vi.fn() },
  runtime: { sendMessage: vi.fn() },
})

vi.mock('../storage', () => ({
  appendLog: vi.fn(async (entry: unknown) => { mockLogs.push(entry as typeof mockLogs[0]) }),
  getAllLogs: vi.fn(async () => [...mockLogs]),
  clearLogs: vi.fn(async () => { mockLogs = [] }),
}))

import { logger, getLogs, clear_logs } from '../services/logger'
import { appendLog } from '../storage'

describe('logger', () => {
  beforeEach(async () => {
    mockLogs = []
    vi.clearAllMocks()
  })

  it('should append an info log entry', async () => {
    await logger.info('connect', 'Connected successfully')
    const logs = await getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].level).toBe('info')
    expect(logs[0].source).toBe('connect')
    expect(logs[0].message).toBe('Connected successfully')
    expect(logs[0].timestamp).toBeTruthy()
  })

  it('should append a warn log entry', async () => {
    await logger.warn('migrate', 'Rate limited')
    const logs = await getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].level).toBe('warn')
  })

  it('should append an error log entry', async () => {
    await logger.error('extract', 'Failed to fetch')
    const logs = await getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].level).toBe('error')
  })

  it('should accumulate multiple entries', async () => {
    await logger.info('a', 'one')
    await logger.info('b', 'two')
    await logger.error('c', 'three')
    const logs = await getLogs()
    expect(logs).toHaveLength(3)
  })

  it('getLogs returns empty array when no logs stored', async () => {
    expect(await getLogs()).toEqual([])
  })

  it('clear_logs removes all entries', async () => {
    await logger.info('test', 'hello')
    await clear_logs()
    expect(await getLogs()).toEqual([])
  })

  it('should fallback to console when storage fails', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.mocked(appendLog).mockRejectedValueOnce(new Error('fail'))

    await logger.info('test', 'fallback message')
    expect(consoleSpy).toHaveBeenCalledWith('[test] fallback message')
    consoleSpy.mockRestore()
  })
})
