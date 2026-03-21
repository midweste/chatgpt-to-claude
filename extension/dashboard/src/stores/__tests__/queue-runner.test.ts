/**
 * Unit tests for queue-runner.ts — pause, cancel, error handling, rate limits.
 */

import { describe, it, expect, vi } from 'vitest'
import { runQueue } from '../queue-runner'
import type { MigrationStore, PushResultRow } from '../migration-store'

// Minimal store state factory
function makeStore(overrides: Partial<MigrationStore> = {}): {
  get: () => MigrationStore
  set: (partial: Partial<MigrationStore> | ((s: MigrationStore) => Partial<MigrationStore>)) => void
  state: MigrationStore
} {
  const results: PushResultRow[] = overrides.results || []
  const state = {
    paused_ref: false,
    cancelled_ref: false,
    status: 'running' as const,
    results,
    fetchUsage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as MigrationStore

  return {
    get: () => state,
    set: (partial) => {
      if (typeof partial === 'function') {
        Object.assign(state, partial(state))
      } else {
        Object.assign(state, partial)
      }
    },
    state,
  }
}

describe('runQueue', () => {
  it('processes all items and calls on_changed for each', async () => {
    const { get, set, state } = makeStore({
      results: [
        { id: 'a', status: 'pending' },
        { id: 'b', status: 'pending' },
      ],
    })

    const push_fn = vi.fn()
      .mockResolvedValueOnce({ id: 'a', status: 'done' })
      .mockResolvedValueOnce({ id: 'b', status: 'done' })

    const on_changed = vi.fn()

    await runQueue(
      [
        { item: { id: 'a' }, result_index: 0 },
        { item: { id: 'b' }, result_index: 1 },
      ],
      push_fn,
      on_changed,
      get, set,
    )

    expect(push_fn).toHaveBeenCalledTimes(2)
    expect(on_changed).toHaveBeenCalledTimes(2)
    expect(state.results[0].status).toBe('done')
    expect(state.results[1].status).toBe('done')
  })

  it('marks items as pushing before push_fn executes', async () => {
    const { get, set, state } = makeStore({
      results: [{ id: 'a', status: 'pending' }],
    })

    const statuses: string[] = []
    const push_fn = vi.fn().mockImplementation(async () => {
      statuses.push(state.results[0].status)
      return { id: 'a', status: 'done' }
    })

    await runQueue(
      [{ item: { id: 'a' }, result_index: 0 }],
      push_fn,
      undefined,
      get, set,
    )

    expect(statuses).toEqual(['pushing'])
  })

  it('stops processing when cancelled', async () => {
    const { get, set, state } = makeStore({
      results: [
        { id: 'a', status: 'pending' },
        { id: 'b', status: 'pending' },
      ],
    })

    const push_fn = vi.fn().mockImplementation(async () => {
      // Cancel after first push
      state.cancelled_ref = true
      return { id: 'a', status: 'done' }
    })

    await runQueue(
      [
        { item: { id: 'a' }, result_index: 0 },
        { item: { id: 'b' }, result_index: 1 },
      ],
      push_fn,
      undefined,
      get, set,
    )

    expect(push_fn).toHaveBeenCalledTimes(1)
    expect(state.results[1].status).toBe('pending') // never reached
  })

  it('handles push_fn exceptions and records error', async () => {
    const { get, set, state } = makeStore({
      results: [{ id: 'a', status: 'pending' }],
    })

    const push_fn = vi.fn().mockRejectedValue(new Error('Network failure'))
    const on_changed = vi.fn()

    await runQueue(
      [{ item: { id: 'a' }, result_index: 0 }],
      push_fn,
      on_changed,
      get, set,
    )

    expect(state.results[0].status).toBe('error')
    expect((state.results[0] as PushResultRow & { error?: string }).error).toBe('Network failure')
    expect(on_changed).toHaveBeenCalled()
  })

  it('auto-pauses on rate limit error result', async () => {
    const { get, set, state } = makeStore({
      results: [
        { id: 'a', status: 'pending' },
        { id: 'b', status: 'pending' },
      ],
    })

    const push_fn = vi.fn()
      .mockResolvedValueOnce({ id: 'a', status: 'error', error: 'rate limit exceeded' })
      .mockResolvedValueOnce({ id: 'b', status: 'done' })

    const on_changed = vi.fn().mockImplementation(() => {
      // After the rate-limit pause, cancel so the queue exits the while-loop
      if (state.paused_ref) state.cancelled_ref = true
    })

    await runQueue(
      [
        { item: { id: 'a' }, result_index: 0 },
        { item: { id: 'b' }, result_index: 1 },
      ],
      push_fn,
      on_changed,
      get, set,
    )

    expect(state.paused_ref).toBe(true)
    expect(state.status).toBe('paused')
    expect(on_changed).toHaveBeenCalled()
    // Second item should not have been pushed (paused then cancelled)
    expect(push_fn).toHaveBeenCalledTimes(1)
  })

  it('auto-pauses on rate limit exception', async () => {
    const { get, set, state } = makeStore({
      results: [{ id: 'a', status: 'pending' }],
    })

    const rateLimitError = Object.assign(new Error('Rate limited'), { isRateLimit: true })
    const push_fn = vi.fn().mockRejectedValue(rateLimitError)
    const on_changed = vi.fn()

    await runQueue(
      [{ item: { id: 'a' }, result_index: 0 }],
      push_fn,
      on_changed,
      get, set,
    )

    expect(state.paused_ref).toBe(true)
    expect(state.status).toBe('paused')
  })

  it('calls fetchUsage every 5 pushes', async () => {
    const { get, set, state } = makeStore({
      results: Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, status: 'pending' as const })),
    })

    const push_fn = vi.fn().mockImplementation(async (item: { id: string }) => ({
      id: item.id,
      status: 'done',
    }))

    await runQueue(
      Array.from({ length: 6 }, (_, i) => ({ item: { id: `c${i}` }, result_index: i })),
      push_fn,
      undefined,
      get, set,
    )

    // fetchUsage should be called once after 5th push
    expect(state.fetchUsage).toHaveBeenCalledTimes(1)
  })
})
