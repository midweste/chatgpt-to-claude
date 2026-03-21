import { useState, useEffect } from 'react'
import {
  runExtraction,
  loadLastExtraction,
  type ExtractionSummary,
  type ExtractionProgress,
  type ExtractionCounts,
} from '@lib/services/extraction-service'
import { logger } from '@lib/services/logger'
import { updateMigrationState } from '@lib/storage'
import { Check, Loader2, RefreshCw, Download, FileText, Code } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useAppStore } from '@/stores/app-store'
import { useConversationStore } from '@/stores/conversation-store'
import { useMigrationStore } from '@/stores/migration-store'
import { exportAll } from '@lib/services/export-service'
import { downloadBlob } from '@lib/utils/file-download'

interface StatProps {
  icon: string
  label: string
  value: string | number
}

function Stat({ icon, label, value }: StatProps) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-foreground">{icon} {label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}

interface StatsData {
  projects: number
  newProjects: number
  projectConversations: number
  newProjectConversations: number
  conversations: number
  newConversations: number
  memories: number
  newMemories: number
  instructions: number
  newInstructions: number
}

interface StatsBlockProps {
  data: StatsData
  date?: string
}

function StatsBlock({ data, date }: StatsBlockProps) {
  return (
    <div className="space-y-1.5 rounded-md border p-3">
      <Stat icon="📁" label="Projects" value={`${data.projects} total, ${data.newProjects ?? data.projects} new`} />
      <Stat icon="📝" label="Project conversations" value={`${data.projectConversations} total, ${data.newProjectConversations ?? data.projectConversations} new`} />
      <Stat icon="💬" label="Conversations" value={`${data.conversations} total, ${data.newConversations ?? data.conversations} new`} />
      <Stat icon="🧠" label="Memories" value={`${data.memories} total, ${data.newMemories ?? data.memories} new`} />
      <Stat icon="⚙️" label="Custom instructions" value={`${data.instructions} total, ${data.newInstructions ?? data.instructions} new`} />
      {date && (
        <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">
          Extracted {new Date(date).toLocaleString()}
        </div>
      )}
    </div>
  )
}

export function ExtractPage() {
  const is_connected = useAppStore((s) => s.is_connected)
  const migration_state = useConversationStore((s) => s.migration_state)
  const conversations = useConversationStore((s) => s.conversations)
  const memories = useConversationStore((s) => s.memories)
  const instructions = useConversationStore((s) => s.instructions)
  const load = useConversationStore((s) => s.load)
  const download_format = useMigrationStore((s) => s.download_format)
  const set_download_format = useMigrationStore((s) => s.set_download_format)

  const has_data = conversations.length > 0

  const [status, setStatus] = useState<'idle' | 'running' | 'complete' | 'error'>('idle')
  const [progress, setProgress] = useState<ExtractionProgress>({ loaded: 0, total: 0, label: '' })
  const [error, setError] = useState('')
  const [lastExtraction, setLastExtraction] = useState<ExtractionSummary | null>(null)
  const [counts, setCounts] = useState<ExtractionCounts>({
    projects: 0,
    newProjects: 0,
    projectConversations: 0,
    newProjectConversations: 0,
    conversations: 0,
    newConversations: 0,
    memories: 0,
    newMemories: 0,
    instructions: 0,
    newInstructions: 0,
    phase: '',
  })

  useEffect(() => {
    loadLastExtraction().then(setLastExtraction)
  }, [])

  const canResume = migration_state?.status === 'downloading' && migration_state.extracted_count > 0

  async function handleExtract() {
    setStatus('running')
    setError('')
    setCounts({ projects: 0, newProjects: 0, projectConversations: 0, newProjectConversations: 0, conversations: 0, newConversations: 0, memories: 0, newMemories: 0, instructions: 0, newInstructions: 0, phase: '' })
    setProgress({ loaded: 0, total: 0, label: '' })

    try {
      const result = await runExtraction({
        on_progress: setProgress,
        on_counts: setCounts,
      })
      setLastExtraction(result)
      setStatus('complete')
      await load()
    } catch (err: unknown) {
      setStatus('error')
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      await logger.error('extract', `Download failed: ${msg}`)
      await updateMigrationState({ status: 'error', error: msg })
      await load()
    }
  }

  if (!is_connected) {
    return (
      <div>
        <h2 className="mb-4 text-lg font-semibold">Download Data</h2>
        <Card><CardContent>
          <p className="text-sm text-muted-foreground">Connect to ChatGPT first to start extraction.</p>
        </CardContent></Card>
      </div>
    )
  }

  const pct = progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Download Data</h2>
      <Card>
        <CardContent>
          {/* Idle */}
          {status === 'idle' && (
            <div className="space-y-6">
              {lastExtraction ? (
                <>
                  <StatsBlock data={lastExtraction} date={lastExtraction.completedAt} />
                  <Button onClick={() => handleExtract()} className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" /> Refresh Data
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Extract all your ChatGPT conversations, memories, projects, and custom instructions.
                  </p>
                  <div className="flex gap-3">
                    <Button onClick={() => handleExtract()} className="flex-1">Download Data</Button>
                    {canResume && (
                      <Button variant="outline" onClick={() => handleExtract()}>
                        Resume ({migration_state!.extracted_count}/{migration_state!.total_conversations})
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Running */}
          {status === 'running' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-muted-foreground">{counts.phase}</span>
              </div>

              {progress.total > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{progress.label}</span>
                    <span className="font-medium tabular-nums">{progress.loaded}/{progress.total}</span>
                  </div>
                  <Progress value={pct} />
                </div>
              )}

              <StatsBlock data={counts} />
            </div>
          )}

          {/* Complete */}
          {status === 'complete' && (
            <div className="space-y-4">
              <div className="py-2 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                  <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-base font-semibold">Extraction Complete</h3>
              </div>
              <StatsBlock data={counts} date={new Date().toISOString()} />
              <Button variant="outline" onClick={() => setStatus('idle')} className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" /> Refresh Data
              </Button>
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
              <Button variant="outline" onClick={() => setStatus('idle')}>Try Again</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Export section — visible after data has been downloaded */}
      {has_data && (
        <div className="mt-6">
          <h3 className="mb-3 text-base font-semibold">Export Data</h3>
          <Card>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Download {conversations.length} conversations, {memories.length} memories, and custom instructions as a zip archive
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    className={`flex items-center gap-3 rounded-lg border p-4 text-left transition-colors ${
                      download_format === 'text'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => set_download_format('text')}
                  >
                    <FileText className={`h-5 w-5 ${download_format === 'text' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div>
                      <p className="text-sm font-medium">Text Transcripts</p>
                      <p className="text-xs text-muted-foreground">One .txt per conversation, memory, instruction</p>
                    </div>
                  </button>
                  <button
                    className={`flex items-center gap-3 rounded-lg border p-4 text-left transition-colors ${
                      download_format === 'json'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => set_download_format('json')}
                  >
                    <Code className={`h-5 w-5 ${download_format === 'json' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div>
                      <p className="text-sm font-medium">JSON</p>
                      <p className="text-xs text-muted-foreground">Structured data per item with mappings</p>
                    </div>
                  </button>
                </div>
                {(conversations.length > 0 || memories.length > 0 || instructions) && (
                <Button
                  onClick={async () => {
                    const blob = await exportAll(
                      { conversations, memories, instructions },
                      download_format === 'json' ? 'json' : 'text',
                    )
                    downloadBlob(`chatgpt-export-${download_format}.zip`, blob)
                  }}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download .zip
                </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
