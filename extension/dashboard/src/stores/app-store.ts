/**
 * App store — global UI state: navigation, GPT connection status.
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { ChatGPTSource } from '@lib/sources/chatgpt'
import { logger } from '@lib/services/logger'
import type { GptConnectionStatus } from '@/types/status-types'

export type Page = 'connect' | 'extract' | 'claude' | 'conversations' | 'memory-export' | 'instructions-export' | 'settings' | 'logs'

export type GptStatus = GptConnectionStatus

export interface AppState {
  page: Page
  is_connected: boolean
  gpt_status: GptStatus
  gpt_error: string
}

export interface AppActions {
  setPage: (page: Page) => void
  set_connected: (connected: boolean) => void
  restoreSession: () => Promise<void>
  connect_gpt: () => Promise<void>
  disconnect_gpt: () => Promise<void>
}

export type AppStore = AppState & AppActions

export const useAppStore = create<AppStore>()(
  subscribeWithSelector((set) => ({
    // ── State ──
    page: 'connect',
    is_connected: false,
    gpt_status: 'loading',
    gpt_error: '',

    // ── Actions ──
    setPage: (page) => set({ page }),

    set_connected: (connected) => {
      set({ is_connected: connected })
      if (!connected) set({ page: 'connect', gpt_status: 'idle' })
    },

    restoreSession: async () => {
      const source = new ChatGPTSource()
      const restored = await source.restoreSession()
      set({
        is_connected: restored,
        gpt_status: restored ? 'connected' : 'idle',
      })
      if (restored) await logger.info('connect', 'ChatGPT session restored')
    },

    connect_gpt: async () => {
      set({ gpt_status: 'connecting', gpt_error: '' })
      try {
        const source = new ChatGPTSource()
        await source.authenticate()
        set({ gpt_status: 'connected', is_connected: true })
        await logger.info('connect', 'Connected to ChatGPT')
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        set({ gpt_status: 'error', gpt_error: message })
        await logger.error('connect', `ChatGPT connection failed: ${message}`)
      }
    },

    disconnect_gpt: async () => {
      await chrome.storage.local.remove('chatgpt_access_token')
      set({ gpt_status: 'idle', is_connected: false })
      await logger.info('connect', 'Disconnected from ChatGPT')
    },
  })),
)
