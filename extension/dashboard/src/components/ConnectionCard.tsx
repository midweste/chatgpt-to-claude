/**
 * ConnectionCard — shared connect/disconnect card for GPT and Claude.
 *
 * Renders a Card with icon, name, subtitle, and status-dependent
 * actions (connect, connecting spinner, connected+disconnect, error+retry).
 */

import { Plug, Check, Loader2, Unplug } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type Status = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'loading'

interface ConnectionCardProps {
  /** Emoji or icon string displayed in the header */
  icon: string
  /** Service name, e.g. "ChatGPT" or "Claude" */
  name: string
  /** Subtitle beneath the name, e.g. "Source" or "Destination" */
  subtitle: string
  /** URL to open for login, shown on idle state */
  login_url: string
  /** Label for the login link */
  login_label: string
  /** Current connection status */
  status: Status
  /** Error message when status is 'error' */
  error?: string
  /** Called when user clicks Connect or Retry */
  onConnect: () => void
  /** Called when user clicks Disconnect */
  onDisconnect: () => void
}

export function ConnectionCard({
  icon, name, subtitle, login_url, login_label, status, error, onConnect, onDisconnect,
}: ConnectionCardProps) {
  const show_connect = status === 'idle' || status === 'disconnected'

  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/5">
              <span className="text-lg">{icon}</span>
            </div>
            <div>
              <h3 className="text-sm font-semibold">{name}</h3>
              <p className="text-xs text-foreground/50">{subtitle}</p>
            </div>
          </div>

          <div>
            {status === 'loading' && (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {show_connect && (
              <div className="flex flex-col items-end gap-1">
                <Button size="sm" onClick={onConnect} className="gap-1">
                  <Plug className="h-3 w-3" /> Connect
                </Button>
                <p className="text-[10px] text-foreground/50">
                  Log in to{' '}
                  <a
                    href={login_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-primary hover:text-primary/80"
                  >
                    {login_label}
                  </a>{' '}
                  first
                </p>
              </div>
            )}

            {status === 'connecting' && (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs text-foreground/60">Connecting...</span>
              </div>
            )}

            {status === 'connected' && (
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-600">Connected</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDisconnect}
                  className="gap-1 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Unplug className="h-3 w-3" /> Disconnect
                </Button>
              </div>
            )}

            {status === 'error' && (
              <div className="flex items-center gap-2">
                <div className="text-xs text-destructive max-w-xs truncate">{error}</div>
                <Button variant="outline" size="sm" onClick={onConnect}>Retry</Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
