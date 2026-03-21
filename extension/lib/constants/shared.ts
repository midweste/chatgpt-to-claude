/**
 * Shared constants — common to all adapters.
 */

/**
 * User-Agent header for proxied requests.
 * Uses the browser's real User-Agent — no spoofing.
 */
export const USER_AGENT = typeof navigator !== 'undefined' ? navigator.userAgent : '';
