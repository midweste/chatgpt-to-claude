/**
 * Navigation configuration — sidebar menu items and grouping.
 */

import type { Page } from '../stores/app-store'
import {
  Plug, Download, Brain, PlaneTakeoff,
  Settings, ScrollText, CloudUpload, FileText,
} from 'lucide-react'

export interface NavItem {
  id: Page
  label: string
  icon: typeof Plug
  gated?: boolean
  alwaysOpen?: boolean
  group?: string
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'connect', label: 'Connect to ChatGPT', icon: Plug, group: 'source' },
  { id: 'extract', label: 'Download', icon: Download, gated: true, group: 'source' },
  { id: 'claude', label: 'Connect to Claude', icon: CloudUpload, gated: true, group: 'destination' },
  { id: 'instructions-export', label: 'Instructions Export', icon: FileText, gated: true, group: 'destination' },
  { id: 'memory-export', label: 'Memory Export', icon: Brain, gated: true, group: 'destination' },
  { id: 'conversations', label: 'Migrate', icon: PlaneTakeoff, gated: true, group: 'destination' },
  { id: 'settings', label: 'Settings', icon: Settings, alwaysOpen: true },
  { id: 'logs', label: 'Logs', icon: ScrollText, alwaysOpen: true },
]
