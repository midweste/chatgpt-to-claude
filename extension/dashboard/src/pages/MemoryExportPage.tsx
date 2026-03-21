/**
 * Memory Export page — guides users through Claude's native memory import flow.
 *
 * Claude has a built-in "Import memory from other AI providers" feature at
 * Settings > Capabilities. This page walks users through that process step by step.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Brain, ExternalLink } from 'lucide-react'

const CLAUDE_SETTINGS_URL = 'https://claude.ai/settings/capabilities'
const CHATGPT_URL = 'https://chatgpt.com/'

export function MemoryExportPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Brain className="h-5 w-5" />
          Import Memories to Claude
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Claude has a built-in feature to import memories from other AI providers.
          Follow the steps below to transfer your ChatGPT memories.
        </p>
      </div>

      {/* Step 1 */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
            Open Claude Settings
          </CardTitle>
          <CardDescription>
            Go to Claude's <strong>Capabilities</strong> settings page. Scroll down to
            the <strong>"Import memory from other AI providers"</strong> section and
            click <strong>"Start import"</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => window.open(CLAUDE_SETTINGS_URL, '_blank')}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Open Claude Settings
          </Button>
        </CardContent>
      </Card>

      {/* Step 2 */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
            Copy the Prompt into ChatGPT
          </CardTitle>
          <CardDescription>
            Claude will provide a prompt for you to copy. Paste it into a{' '}
            <strong>ChatGPT conversation</strong> and send it — ChatGPT will export
            your memories and context. Copy ChatGPT's full response when it's done.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => window.open(CHATGPT_URL, '_blank')}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Open ChatGPT
          </Button>
        </CardContent>
      </Card>

      {/* Step 3 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
            Paste into Claude and Import
          </CardTitle>
          <CardDescription>
            Go back to the Claude import dialog from step 1. Paste ChatGPT's response
            into the text area and click <strong>"Add to memory"</strong>. Claude will
            save the imported memories permanently.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => window.open(CLAUDE_SETTINGS_URL, '_blank')}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Open Claude Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
