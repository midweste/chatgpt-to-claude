/**
 * Timestamp utility — parse various timestamp formats into ISO strings.
 */

/** Parse ChatGPT timestamps: ISO strings, epoch seconds, or epoch milliseconds → ISO string | null */
export function safeTimestamp(ts: unknown): string | null {
  if (ts == null) return null;
  if (typeof ts === 'string') {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof ts === 'number') {
    const ms = ts < 1e12 ? ts * 1000 : ts;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}
