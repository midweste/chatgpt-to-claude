/**
 * Conversation store — conversations, memories, instructions, projects.
 *
 * Central source of truth for all extracted data.
 * Raw objects from IndexedDB + unified tracking table.
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import {
  getAllConversations,
  getAllMemories,
  getInstructions as getStoredInstructions,
  getMigrationState,
  getAllTracking,
  type TrackingRecord,
  type MigrationState,
} from '@lib/storage'
import {
  toggleSelection,
  toggleAllSelection,
  patchTracking,
  resetPushed,
  deleteTrackingByIds,
} from '@lib/storage/tracking-repository'
import { getSetting, setSetting } from '@lib/storage'
import { refreshPushedStatus } from '@lib/services/pushed-status-service'
import type { Project } from '@lib/interfaces/project'
import { ChatGPTInstruction } from '@lib/sources/chatgpt-instruction'
import type { ClaudeDestination } from '@lib/destinations/claude'
import type { ChatGPTRawConversation, ChatGPTRawMemory, ChatGPTRawInstructions } from '@lib/interfaces/chatgpt-api-types'

/** Build a Map<id, TrackingRecord> from an array of tracking records. */
function build_tracking_map(records: TrackingRecord[]): Map<string, TrackingRecord> {
  const map = new Map<string, TrackingRecord>()
  for (const record of records) {
    map.set(record.id, record)
  }
  return map
}

export interface ConversationState {
  conversations: ChatGPTRawConversation[]
  memories: ChatGPTRawMemory[]
  instructions: ChatGPTRawInstructions | null
  projects: Project[]
  tracking: Map<string, TrackingRecord>
  migration_state: MigrationState | null
  is_loaded: boolean
}

export interface ConversationActions {
  load: () => Promise<void>
  refresh: () => Promise<void>
  toggleSelection: (id: string, selected: boolean) => Promise<void>
  toggle_all_selection: (ids: string[], selected: boolean) => Promise<void>
  markPushed: (id: string, fields: { claude_id?: string; pushed_at?: string }) => Promise<void>
  set_projects: (projects: Project[]) => Promise<void>
  reset_pushed: (type?: 'conversation' | 'memory' | 'instruction') => Promise<number>
  refreshPushed: (claude: ClaudeDestination, claude_convs?: Array<{ uuid: string; name: string }>) => Promise<void>
}

export type ConversationStore = ConversationState & ConversationActions

export const useConversationStore = create<ConversationStore>()(
  subscribeWithSelector((set, get) => ({
    // ── State ──
    conversations: [],
    memories: [],
    instructions: null,
    projects: [],
    tracking: new Map(),
    migration_state: null,
    is_loaded: false,

    // ── Actions ──
    load: async () => {
      const [conversations, memories, instructions, migration_state, tracking_records] = await Promise.all([
        getAllConversations(),
        getAllMemories(),
        getStoredInstructions(),
        getMigrationState(),
        getAllTracking(),
      ])

      let projects: Project[] = []
      try {
        projects = await getSetting<Project[]>('projects', [])
      } catch { /* ignore */ }

      const tracking = build_tracking_map(tracking_records)

      set({
        conversations, memories, instructions, projects, tracking, migration_state,
        is_loaded: true,
      })
    },

    refresh: async () => {
      const [conversations, migration_state, tracking_records] = await Promise.all([
        getAllConversations(),
        getMigrationState(),
        getAllTracking(),
      ])

      // Clean up orphan tracking records for deleted conversations
      const conv_ids = new Set(
        conversations.map((c) => (c.id ?? c.conversation_id ?? '') as string),
      )
      const orphan_ids = tracking_records
        .filter((t) => t.type === 'conversation' && !conv_ids.has(t.id))
        .map((t) => t.id)
      if (orphan_ids.length > 0) {
        await deleteTrackingByIds(orphan_ids)
      }

      const clean_records = orphan_ids.length > 0
        ? tracking_records.filter((t) => !orphan_ids.includes(t.id))
        : tracking_records
      const tracking = build_tracking_map(clean_records)
      set({ conversations, migration_state, tracking })
    },

    toggleSelection: async (id, selected) => {
      // Optimistic update
      set((state) => {
        const next = new Map(state.tracking)
        const existing = next.get(id)
        if (existing) {
          next.set(id, { ...existing, is_selected: selected })
        } else {
          next.set(id, { id, type: 'conversation', is_selected: selected, status: 'extracted' })
        }
        return { tracking: next }
      })
      await toggleSelection(id, selected)
    },

    toggle_all_selection: async (ids, selected) => {
      // Optimistic update
      set((state) => {
        const next = new Map(state.tracking)
        for (const id of ids) {
          const existing = next.get(id)
          if (existing) {
            next.set(id, { ...existing, is_selected: selected })
          } else {
            next.set(id, { id, type: 'conversation', is_selected: selected, status: 'extracted' })
          }
        }
        return { tracking: next }
      })
      await toggleAllSelection(ids, selected)
    },

    markPushed: async (id, fields) => {
      await patchTracking(id, { status: 'done', ...fields })
      set((state) => {
        const next = new Map(state.tracking)
        const existing = next.get(id)
        if (existing) {
          next.set(id, { ...existing, status: 'done', ...fields })
        }
        return { tracking: next }
      })
    },

    set_projects: async (projects) => {
      set({ projects })
      await setSetting('projects', projects)
    },

    reset_pushed: async (type) => {
      const count = await resetPushed(type)
      // Reload tracking
      const tracking_records = await getAllTracking()
      const tracking = build_tracking_map(tracking_records)
      set({ tracking })
      return count
    },

    refreshPushed: async (claude, claude_convs) => {
      // Refresh conversation pushed status
      await refreshPushedStatus(claude, claude_convs)

      // Refresh instruction pushed status via substring match
      try {
        const claude_instructions = await claude.getAccountInstructions()
        const { instructions } = get()
        if (instructions) {
          const inst = new ChatGPTInstruction(instructions)
          if (inst.about_user && claude_instructions.includes(inst.about_user.trim())) {
            await patchTracking('about-user', { status: 'done' })
          }
          if (inst.about_model && claude_instructions.includes(inst.about_model.trim())) {
            await patchTracking('about-model', { status: 'done' })
          }
        }
      } catch { /* best-effort */ }

      // Reload all tracking
      const tracking = build_tracking_map(await getAllTracking())
      const conversations = await getAllConversations()
      const migration_state = await getMigrationState()
      set({ conversations, migration_state, tracking })
    },
  })),
)

// ── Derived selectors ────────────────────────────────────────────

/** Factory for tracking count selectors to avoid near-identical boilerplate. */
function make_selected_count_selector(
  type: TrackingRecord['type'],
  excludeStatus?: TrackingRecord['status'],
): (state: ConversationStore) => number {
  return (state) => {
    let count = 0
    for (const [, track] of state.tracking) {
      if (track.type === type && track.is_selected) {
        if (!excludeStatus || track.status !== excludeStatus) count++
      }
    }
    return count
  }
}

export const selectSelectedCount = make_selected_count_selector('conversation', 'done')
export const selectSelectedMemoryCount = make_selected_count_selector('memory')
export const selectSelectedInstructionCount = make_selected_count_selector('instruction')

export const selectHasData = (state: ConversationStore) =>
  state.conversations.length > 0

// Memoized — only recomputes when projects array reference changes
let _cached_projects: Project[] | undefined = undefined
let _cached_conv_project_map: Map<string, string> = new Map()

/** Build a conv_id → project_name map from a projects array. Memoized by reference. */
export function buildConvProjectMap(projects: Project[]): Map<string, string> {
  if (projects === _cached_projects) return _cached_conv_project_map
  _cached_projects = projects
  const map = new Map<string, string>()
  for (const project of projects) {
    for (const conv_id of project.conversation_ids) {
      map.set(conv_id, project.name)
    }
  }
  _cached_conv_project_map = map
  return map
}

/** Reset the module-level cache. Use in tests or HMR to prevent stale state. */
export function resetConvProjectMapCache(): void {
  _cached_projects = undefined
  _cached_conv_project_map = new Map()
}
