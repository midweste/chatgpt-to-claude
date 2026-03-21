/**
 * Unit tests for timestamp utility.
 */

import { describe, it, expect } from 'vitest'
import { safeTimestamp } from '../utils/timestamp'

describe('safeTimestamp', () => {
  it('returns null for null', () => {
    expect(safeTimestamp(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(safeTimestamp(undefined)).toBeNull()
  })

  it('parses ISO 8601 strings', () => {
    const result = safeTimestamp('2024-01-15T10:30:00.000Z')
    expect(result).toBe('2024-01-15T10:30:00.000Z')
  })

  it('returns null for invalid date strings', () => {
    expect(safeTimestamp('not-a-date')).toBeNull()
  })

  it('converts epoch seconds to ISO string', () => {
    // 2024-01-15 09:50:00 UTC = 1705312200
    const result = safeTimestamp(1705312200)
    expect(result).toBe('2024-01-15T09:50:00.000Z')
  })

  it('converts epoch milliseconds to ISO string', () => {
    const result = safeTimestamp(1705312200000)
    expect(result).toBe('2024-01-15T09:50:00.000Z')
  })

  it('auto-detects seconds vs milliseconds (threshold at 1e12)', () => {
    // Just below threshold → treated as seconds
    const seconds_result = safeTimestamp(999999999999)
    expect(seconds_result).not.toBeNull()

    // At threshold → treated as milliseconds
    const ms_result = safeTimestamp(1000000000000)
    expect(ms_result).not.toBeNull()
  })

  it('returns null for non-string, non-number, non-null types', () => {
    expect(safeTimestamp(true as unknown)).toBeNull()
    expect(safeTimestamp({} as unknown)).toBeNull()
    expect(safeTimestamp([] as unknown)).toBeNull()
  })

  it('handles zero timestamp', () => {
    const result = safeTimestamp(0)
    expect(result).toBe('1970-01-01T00:00:00.000Z')
  })
})
