/**
 * Connect to Claude page — handles Claude authentication + import settings.
 */

import { useEffect } from 'react'
import { useMigrationStore } from '@/stores/migration-store'
import { ConnectionCard } from '@/components/ConnectionCard'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'


export function ClaudePage() {
  const claude_status = useMigrationStore((s) => s.claude_status)
  const claude_error = useMigrationStore((s) => s.claude_error)
  const connectClaude = useMigrationStore((s) => s.connectClaude)
  const disconnectClaude = useMigrationStore((s) => s.disconnectClaude)

  const name_prefix = useMigrationStore((s) => s.name_prefix)
  const default_project = useMigrationStore((s) => s.default_project)
  const prompt_prefix = useMigrationStore((s) => s.prompt_prefix)
  const prompt_suffix = useMigrationStore((s) => s.prompt_suffix)
  const set_name_prefix = useMigrationStore((s) => s.set_name_prefix)
  const set_default_project = useMigrationStore((s) => s.set_default_project)
  const set_prompt_prefix = useMigrationStore((s) => s.set_prompt_prefix)
  const set_prompt_suffix = useMigrationStore((s) => s.set_prompt_suffix)


  // Auto-connect on mount
  useEffect(() => {
    if (claude_status === 'idle') {
      connectClaude()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Connect to Claude</h2>
      <ConnectionCard
        icon="✦"
        name="Claude"
        subtitle="Destination"
        login_url="https://claude.ai"
        login_label="claude.ai"
        status={claude_status}
        error={claude_error}
        onConnect={connectClaude}
        onDisconnect={disconnectClaude}
      />

      {claude_status === 'connected' && (
        <>
          <h2 className="mb-4 mt-8 text-lg font-semibold">Import Settings</h2>
          <Card>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-foreground/60">Default Project</label>
                    <Input
                      type="text"
                      placeholder="Claude project for imported conversations"
                      value={default_project}
                      onChange={(e) => set_default_project(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-foreground/60">Conversation Name Prefix</label>
                    <Input
                      type="text"
                      placeholder="Optional prefix for conversation titles"
                      value={name_prefix}
                      onChange={(e) => set_name_prefix(e.target.value)}
                    />
                  </div>
                </div>




                <div>
                  <label className="mb-1 block text-xs text-foreground/60">Prompt Prefix</label>
                  <Textarea
                    rows={6}
                    className="text-sm"
                    value={prompt_prefix}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set_prompt_prefix(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-foreground/60">Prompt Suffix</label>
                  <Textarea
                    rows={4}
                    className="text-sm"
                    value={prompt_suffix}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set_prompt_suffix(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
