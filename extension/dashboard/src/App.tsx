/**
 * App root — layout shell with sidebar + page routing.
 *
 * All navigation logic lives in AppSidebar and useNavigation.
 * This component is a thin composition of layout + page switching.
 */

import { useEffect } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'
import './index.css'

import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from '@/components/ui/sidebar'

import { useAppStore } from './stores/app-store'
import { useConversationStore } from './stores/conversation-store'
import { useMigrationStore } from './stores/migration-store'

import { AppSidebar } from './components/AppSidebar'

import { ConnectPage } from './pages/ConnectPage'
import { ExtractPage } from './pages/ExtractPage'
import { ConversationsPage } from './pages/ConversationsPage'
import { MemoryExportPage } from './pages/MemoryExportPage'
import { InstructionsExportPage } from './pages/InstructionsExportPage'
import { ClaudePage } from './pages/ClaudePage'
import { SettingsPage } from './pages/SettingsPage'
import { LogsPage } from './pages/LogsPage'

export default function App() {
  const isMobile = useIsMobile()
  const page = useAppStore((s) => s.page)

  const load = useConversationStore((s) => s.load)
  const restoreSession = useAppStore((s) => s.restoreSession)
  const hydrate = useMigrationStore((s) => s.hydrate)

  useEffect(() => {
    load()
    restoreSession()
    hydrate()
  }, [load, restoreSession, hydrate])

  return (
    <div>
      <Toaster />
      <TooltipProvider>
        <SidebarProvider defaultOpen={!isMobile}>
          <AppSidebar />

          <SidebarInset>
            <div className="flex-1 overflow-auto p-6 lg:p-8">
              <div className="mb-4 flex items-center gap-2 md:hidden">
                <SidebarTrigger />
                <span className="text-sm font-medium text-muted-foreground">Menu</span>
              </div>
              {page === 'connect' && <ConnectPage />}
              {page === 'extract' && <ExtractPage />}
              {page === 'claude' && <ClaudePage />}
              {page === 'conversations' && <ConversationsPage />}
              {page === 'memory-export' && <MemoryExportPage />}
              {page === 'instructions-export' && <InstructionsExportPage />}

              {page === 'settings' && <SettingsPage />}
              {page === 'logs' && <LogsPage />}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </div>
  )
}
