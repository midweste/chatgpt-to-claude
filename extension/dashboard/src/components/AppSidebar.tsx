/**
 * App sidebar — main navigation component.
 *
 * Reads navigation config and gating state to render
 * the sidebar with proper unlock/completion indicators.
 */

import { Check, Send } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarFooter,
  SidebarTrigger,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { useAppStore, type Page } from '../stores/app-store'
import { useConversationStore } from '../stores/conversation-store'
import { useNavigation } from '../hooks/use-navigation'
import { NAV_ITEMS, type NavItem } from '../config/navigation'

export function AppSidebar() {
  const isMobile = useIsMobile()
  const page = useAppStore((s) => s.page)
  const setPage = useAppStore((s) => s.setPage)
  const conversations = useConversationStore((s) => s.conversations)
  const { setOpenMobile } = useSidebar()
  const { is_unlocked, is_next_step, is_completed, has_data, selected_count } = useNavigation()

  function handleNavigate(id: Page) {
    setPage(id)
    if (isMobile) setOpenMobile(false)
  }

  const source_items = NAV_ITEMS.filter((i) => i.group === 'source')
  const destination_items = NAV_ITEMS.filter((i) => i.group === 'destination')
  const utility_items = NAV_ITEMS.filter((i) => i.alwaysOpen)

  function renderNavItem(item: NavItem) {
    const unlocked = is_unlocked(item.id)
    const disabled = item.gated && !unlocked
    const next = is_next_step(item.id)
    const completed = is_completed(item.id)

    return (
      <SidebarMenuItem key={item.id}>
        <SidebarMenuButton
          isActive={page === item.id}
          onClick={() => !disabled && handleNavigate(item.id)}
          tooltip={item.label}
          className={disabled ? 'pointer-events-none opacity-40' : ''}
        >
          <item.icon className="h-4 w-4" />
          <span>{item.label}</span>
        </SidebarMenuButton>
        {completed && (
          <SidebarMenuBadge><Check className="h-3 w-3 text-green-500" /></SidebarMenuBadge>
        )}
        {next && !completed && (
          <SidebarMenuBadge>
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">!</span>
          </SidebarMenuBadge>
        )}
        {item.id === 'extract' && has_data && !next && (
          <SidebarMenuBadge>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-green-500 px-1 text-[10px] font-bold text-white">{conversations.length}</span>
          </SidebarMenuBadge>
        )}
        {item.id === 'conversations' && has_data && selected_count > 0 && !next && (
          <SidebarMenuBadge>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-green-500 px-1 text-[10px] font-bold text-white">{selected_count}</span>
          </SidebarMenuBadge>
        )}
      </SidebarMenuItem>
    )
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-5">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 shrink-0 text-foreground/70" />
          <p className="text-base font-semibold tracking-tight group-data-[collapsible=icon]:hidden">ChatGPT to Claude</p>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-normal text-muted-foreground/70 uppercase tracking-wider">Source</SidebarGroupLabel>
          <SidebarMenu>{source_items.map(renderNavItem)}</SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-normal text-muted-foreground/70 uppercase tracking-wider">Destination</SidebarGroupLabel>
          <SidebarMenu>{destination_items.map(renderNavItem)}</SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-normal text-muted-foreground/70 uppercase tracking-wider">Tools</SidebarGroupLabel>
          <SidebarMenu>{utility_items.map(renderNavItem)}</SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarTrigger />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
