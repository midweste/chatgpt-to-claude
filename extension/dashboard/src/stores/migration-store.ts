/**
 * Migration store — Claude connection and migration state machine.
 *
 * Composes extracted slices:
 * - claude-connection-slice: connection lifecycle
 * - migration-settings-slice: settings persistence
 * - queue-runner: shared pause/cancel loop
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { MigrationService } from '@lib/services/migration-service'
import type { PushResult } from '@lib/services/migration-service'
import type { IConversation } from '@lib/interfaces/conversation'
import type { Project } from '@lib/interfaces/project'
import { logger } from '@lib/services/logger'


import { connectClaude, disconnectClaude, fetchUsage, hydrateStore } from './claude-connection-slice'
import type { ClaudeUsage, RefreshPushedFn } from './claude-connection-slice'
import { loadSettings, saveSettings, SETTINGS_DEFAULTS, DEFAULT_PROMPT_PREFIX, DEFAULT_PROMPT_SUFFIX } from './migration-settings-slice'
import { runQueue } from './queue-runner'
import type { ClaudeConnectionStatus, MigrationStatus, MigrateMode, PushFormat } from '@/types/status-types'

export type { ClaudeConnectionStatus, MigrationStatus, MigrateMode, PushFormat }

export { DEFAULT_PROMPT_PREFIX, DEFAULT_PROMPT_SUFFIX }

// Lazy callback to avoid circular import: migration-store ↔ conversation-store.
// Resolved at call-time, not import-time.
const refreshPushed_callback: RefreshPushedFn = async (claude, claude_convs) => {
  const { useConversationStore } = await import('./conversation-store')
  await useConversationStore.getState().refreshPushed(claude, claude_convs)
}

/** Extended PushResult for UI state (adds 'pending' and 'pushing') */
export type PushResultRow = PushResult | { id: string; status: 'pending' | 'pushing' }

/** Generic item that can be pushed to Claude via push_queue */
export type PushQueueItem = {
  id: string
  type: 'Conversation' | 'Memory' | 'Instruction'
  title: string
  content?: string
}

/** PushQueueItem with UI-display fields for the queue table */
export type QueueItem = PushQueueItem & {
  detail: string
  messages?: number
  raw?: Record<string, unknown>
}

export interface MigrationState {
  // Claude connection
  claude: import('@lib/destinations/claude').ClaudeDestination | null
  claude_status: ClaudeConnectionStatus
  claude_error: string
  claude_titles: Set<string>

  // Usage / rate limits
  usage: ClaudeUsage | null

  // Migration state machine
  status: MigrationStatus
  results: PushResultRow[]

  // Settings (persisted to IndexedDB via storage)
  mode: MigrateMode
  model: string
  prompt_prefix: string
  prompt_suffix: string
  push_format: PushFormat
  name_prefix: string
  default_project: string
  download_format: 'text' | 'json'
  skip_duplicates: boolean

  // Control
  paused_ref: boolean
  cancelled_ref: boolean
}

export interface MigrationActions {
  hydrate: () => Promise<void>
  connectClaude: () => Promise<void>
  disconnectClaude: () => void
  fetchUsage: () => Promise<void>

  start_migration: (
    conversations: IConversation[],
    projects: Project[],
    on_conversation_changed?: () => void,
  ) => Promise<void>
  pause: () => void
  resume: () => void
  cancel: () => void
  retry_failed: (
    conversations: IConversation[],
    projects: Project[],
    on_conversation_changed?: () => void,
  ) => Promise<void>

  /** Push arbitrary content to Claude as a new conversation. Returns the Claude conversation UUID or throws. */
  push_content: (content: string, title: string, project_name?: string) => Promise<string>

  /** Unified push dispatcher — routes by item type. Returns UUID for conversations, empty string for others. */
  push_item: (item: { type: 'Conversation' | 'Memory' | 'Instruction'; content: string; title: string }) => Promise<string>

  /** Push a queue of mixed items (conversations, instructions, memories) to Claude. */
  push_queue: (items: PushQueueItem[], on_item_changed?: () => void) => Promise<void>

  set_mode: (mode: MigrateMode) => void
  set_model: (model: string) => void
  set_prompt_prefix: (prefix: string) => void
  set_prompt_suffix: (suffix: string) => void
  set_push_format: (format: PushFormat) => void
  set_name_prefix: (prefix: string) => void
  set_default_project: (name: string) => void
  set_download_format: (format: 'text' | 'json') => void
  set_skip_duplicates: (skip: boolean) => void
  reset: () => void
  reset_preferences: () => void
}

export type MigrationStore = MigrationState & MigrationActions

const defaults: MigrationState = {
  claude: null,
  claude_status: 'idle',
  claude_error: '',
  claude_titles: new Set(),
  usage: null,
  status: 'idle',
  results: [],
  ...SETTINGS_DEFAULTS,
  paused_ref: false,
  cancelled_ref: false,
}

export const useMigrationStore = create<MigrationStore>()(
  subscribeWithSelector((set, get) => ({
    ...defaults,

    // ── Connection (delegated to claude-connection-slice) ──

    hydrate: () => hydrateStore(set, loadSettings, refreshPushed_callback),
    connectClaude: () => connectClaude(set, refreshPushed_callback),
    disconnectClaude: () => disconnectClaude(set),
    fetchUsage: () => fetchUsage(get, set),

    // ── Migration State Machine ──

    start_migration: async (conversations, projects, on_conversation_changed) => {
      const state = get()
      if (!state.claude || state.status === 'running') return

      const queued = conversations.filter((c) => c.data && (c as IConversation).id)
      if (queued.length === 0) return

      const service = new MigrationService(state.claude, projects)
      await service.init()

      // Filter duplicates if enabled
      let to_push = queued
      if (state.skip_duplicates && state.claude_titles.size > 0) {
        to_push = queued.filter((c) => !state.claude_titles.has(c.title || ''))
      }

      // Sort oldest-first so newest conversations appear most recently on Claude
      to_push.sort((a, b) => {
        const a_time = a.created_at ? new Date(a.created_at).getTime() : 0
        const b_time = b.created_at ? new Date(b.created_at).getTime() : 0
        return a_time - b_time
      })

      const initial_results: PushResultRow[] = to_push.map((c) => ({ id: c.id, status: 'pending' as const }))
      set({ status: 'running', results: initial_results, paused_ref: false, cancelled_ref: false })

      await runQueue(
        to_push.map((conv, i) => ({ item: conv, result_index: i })),
        (conv) => service.pushConversation(conv, { model: state.model, prompt_prefix: state.prompt_prefix, prompt_suffix: state.prompt_suffix, push_format: state.push_format, name_prefix: state.name_prefix, default_project: state.default_project }),
        on_conversation_changed,
        get, set,
      )

      set({ status: 'done' })
    },

    pause: () => set({ status: 'paused', paused_ref: true }),
    resume: () => set({ status: 'running', paused_ref: false }),
    cancel: () => set({ status: 'done', cancelled_ref: true, paused_ref: false }),

    retry_failed: async (conversations, projects, on_conversation_changed) => {
      const state = get()
      if (!state.claude) return

      const failed_ids = state.results.filter((r) => r.status === 'error').map((r) => r.id)
      if (failed_ids.length === 0) return

      const failed_convs = conversations.filter((c) => failed_ids.includes(c.id))
      const service = new MigrationService(state.claude, projects)
      await service.init()

      set({ status: 'running', paused_ref: false, cancelled_ref: false })

      await runQueue(
        failed_convs.map((conv) => ({
          item: conv,
          result_index: state.results.findIndex((r) => r.id === conv.id),
        })),
        (conv) => service.pushConversation(conv, { model: state.model, prompt_prefix: state.prompt_prefix, prompt_suffix: state.prompt_suffix, push_format: state.push_format, name_prefix: state.name_prefix, default_project: state.default_project }),
        on_conversation_changed,
        get, set,
      )

      set({ status: 'done' })
    },

    // ── Settings (delegated to migration-settings-slice) ──

    set_mode: (mode) => { set({ mode }); saveSettings({ ...get(), mode }) },
    set_model: (model) => { set({ model }); saveSettings({ ...get(), model }) },
    set_prompt_prefix: (prefix) => { set({ prompt_prefix: prefix }); saveSettings({ ...get(), prompt_prefix: prefix }) },
    set_prompt_suffix: (suffix) => { set({ prompt_suffix: suffix }); saveSettings({ ...get(), prompt_suffix: suffix }) },
    set_push_format: (format) => { set({ push_format: format }); saveSettings({ ...get(), push_format: format }) },
    set_name_prefix: (prefix) => { set({ name_prefix: prefix }); saveSettings({ ...get(), name_prefix: prefix }) },
    set_default_project: (name) => { set({ default_project: name }); saveSettings({ ...get(), default_project: name }) },
    reset_preferences: () => {
      set({
        model: SETTINGS_DEFAULTS.model,
        prompt_prefix: SETTINGS_DEFAULTS.prompt_prefix,
        prompt_suffix: SETTINGS_DEFAULTS.prompt_suffix,
        push_format: SETTINGS_DEFAULTS.push_format,
        name_prefix: SETTINGS_DEFAULTS.name_prefix,
        default_project: SETTINGS_DEFAULTS.default_project,
        download_format: SETTINGS_DEFAULTS.download_format,
      })
    },
    set_download_format: (format) => { set({ download_format: format }); saveSettings({ ...get(), download_format: format }) },
    set_skip_duplicates: (skip) => { set({ skip_duplicates: skip }); saveSettings({ ...get(), skip_duplicates: skip }) },

    reset: () => set({ ...defaults }),

    // ── Push operations ──

    push_content: async (content, title, project_name) => {
      const { claude, model, name_prefix, default_project } = get()
      if (!claude) throw new Error('Not connected to Claude')
      const created = await claude.createConversation()
      await claude.sendMessage(created.uuid, content, undefined, model)
      const display_name = name_prefix ? `${name_prefix}${title}` : title
      await claude.renameConversation(created.uuid, display_name)
      await logger.info('migrate', `✓ Pushed "${display_name}" → Claude (${created.uuid})`)

      // Project placement — delegates to ClaudeDestination's cached resolver
      const target_project = project_name || default_project
      if (target_project) {
        try {
          const project_uuid = await claude.resolveOrCreateProject(target_project)
          await claude.moveToProject([created.uuid], project_uuid)
          await logger.info('migrate', `Moved "${display_name}" → project "${target_project}"`)
        } catch (err) {
          await logger.error('migrate', `Could not move to project "${target_project}": ${err instanceof Error ? err.message : err}`)
        }
      }

      return created.uuid
    },

    push_item: async ({ type, content }) => {
      const { claude } = get()
      if (!claude) throw new Error('Not connected to Claude')

      switch (type) {
        case 'Conversation':
          throw new Error('Conversations must be pushed via start_migration, not push_item')

        case 'Instruction':
          await claude.setAccountInstructions(content)
          await logger.info('migrate', `✓ Pushed instructions → Claude account`)
          return ''

        case 'Memory':
          throw new Error('Memory push not yet implemented — capture the API endpoint first')

        default:
          throw new Error(`Unknown push type: ${type}`)
      }
    },

    push_queue: async (items, on_item_changed) => {
      const { claude } = get()
      if (!claude || get().status === 'running') return
      if (items.length === 0) return

      const initial_results: PushResultRow[] = items.map((item) => ({ id: item.id, status: 'pending' as const }))
      set({ status: 'running', results: initial_results, paused_ref: false, cancelled_ref: false })

      // Separate instructions from other items — instructions get aggregated
      const instruction_items = items.filter((i) => i.type === 'Instruction')
      const other_items = items.filter((i) => i.type !== 'Instruction')

      // Push aggregated instructions first (single API call)
      if (instruction_items.length > 0) {
        const instruction_indices = instruction_items.map((item) => items.indexOf(item))

        // Mark all instruction items as pushing
        set((s) => ({
          results: s.results.map((r, idx) =>
            instruction_indices.includes(idx) ? { ...r, status: 'pushing' as const } : r,
          ),
        }))

        try {
          const existing = await claude.getAccountInstructions()
          const new_parts = instruction_items
            .map((item) => {
              const title = item.id === 'about-user' ? 'About Me' : 'Response Style'
              return `${title}: ${(item.content || '').trim()}`
            })
            .filter((content) => !existing.includes(content))

          if (new_parts.length > 0) {
            const combined = existing
              ? `${existing}\n${new_parts.join('\n')}`
              : new_parts.join('\n')
            await claude.setAccountInstructions(combined)
            await logger.info('migrate', `✓ Pushed ${new_parts.length} instruction(s) → Claude account`)
          } else {
            await logger.info('migrate', `Instructions already present in Claude — skipped`)
          }

          set((s) => ({
            results: s.results.map((r, idx) =>
              instruction_indices.includes(idx) ? { id: items[idx].id, status: 'done' as const, uuid: '' } : r,
            ),
          }))

          for (const item of instruction_items) {
            const { useConversationStore } = await import('./conversation-store')
            await useConversationStore.getState().markPushed(item.id, { pushed_at: new Date().toISOString() })
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          set((s) => ({
            results: s.results.map((r, idx) =>
              instruction_indices.includes(idx) ? { id: items[idx].id, status: 'error' as const, error: msg } : r,
            ),
          }))
        }

        on_item_changed?.()
      }

      // Push other items one by one via shared runQueue
      const queue_entries = other_items.map((item) => ({
        item,
        result_index: items.indexOf(item),
      }))

      await runQueue(
        queue_entries,
        async (item) => {
          const uuid = await get().push_item({ ...item, content: item.content || '' })
          return { id: item.id, status: 'done' as const, claude_id: uuid }
        },
        on_item_changed,
        get, set,
      )

      set({ status: 'done' })
    },
  })),
)
