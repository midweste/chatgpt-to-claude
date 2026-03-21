/**
 * Shared status type aliases — single source of truth for state machine values.
 *
 * Each union replaces scattered string literals across stores, pages, and columns.
 */

/** ChatGPT source connection lifecycle */
export type GptConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'loading'

/** Claude destination connection lifecycle */
export type ClaudeConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

/** Push/migration queue state machine */
export type MigrationStatus = 'idle' | 'running' | 'paused' | 'done'

/** Individual push result status */
export type PushItemStatus = 'pending' | 'pushing' | 'done' | 'error'

/** Data download/export format */
export type PushFormat = 'markdown' | 'text'

/** Migration mode — download files or push to Claude */
export type MigrateMode = 'download' | 'push'
