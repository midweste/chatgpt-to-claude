/**
 * Instructions Export page — displays downloaded ChatGPT custom instructions
 * ("About You" and "Response Style") in a clean, readable format with
 * copy + link to Claude's general settings for manual import.
 */

import { useState, useCallback, useEffect } from 'react'
import { ChatGPTInstruction } from '@lib/sources/chatgpt-instruction'
import { getInstructions } from '@lib/storage'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollText, Copy, ExternalLink, Check } from 'lucide-react'

const CLAUDE_SETTINGS_URL = 'https://claude.ai/settings'

export function InstructionsExportPage() {
  const [aboutUser, setAboutUser] = useState('')
  const [aboutModel, setAboutModel] = useState('')
  const [copiedUser, setCopiedUser] = useState(false)
  const [copiedModel, setCopiedModel] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getInstructions()
      .then((raw) => {
        if (!raw) {
          setError('No custom instructions found. Download your ChatGPT data on the Download page first.')
          return
        }
        const inst = new ChatGPTInstruction(raw)
        if (inst.about_user) setAboutUser(inst.about_user)
        if (inst.about_model) setAboutModel(inst.about_model)
        if (!inst.about_user && !inst.about_model) {
          setError('Your ChatGPT account has no custom instructions set.')
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  const handleCopy = useCallback(async (text: string, setter: (v: boolean) => void) => {
    await navigator.clipboard.writeText(text)
    setter(true)
    setTimeout(() => setter(false), 2000)
  }, [])

  const hasContent = aboutUser || aboutModel

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ScrollText className="h-5 w-5" />
          Custom Instructions
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {hasContent
            ? `Below are the custom instructions from your ChatGPT account. These tell the AI who you are and how you'd like it to respond. Copy each section and paste it into Claude's settings to carry your preferences over.`
            : 'Download your ChatGPT data on the Download page first, then come back here to view and export your custom instructions.'}
        </p>
      </div>

      {/* Error */}
      {error && (
        <Card className="mb-4 border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* About You section */}
      {aboutUser && (
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">About You</CardTitle>
            <CardDescription>
              This is what you told ChatGPT about yourself — your background, role,
              location, and anything else that helps the AI personalize its responses.
              In Claude, go to <strong>Settings</strong> and paste this into the{' '}
              <strong>"What would you like Claude to know about you?"</strong> field.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={aboutUser}
              onChange={(e) => setAboutUser(e.target.value)}
              className="min-h-[80px] font-mono text-sm"
            />
            <div className="mt-3 flex items-center gap-2">
              <Button onClick={() => handleCopy(aboutUser, setCopiedUser)}>
                {copiedUser ? (
                  <>
                    <Check className="mr-2 h-4 w-4 text-green-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Response Style section */}
      {aboutModel && (
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Response Style</CardTitle>
            <CardDescription>
              This is how you told ChatGPT to respond — tone, formatting, length,
              and style preferences. In Claude, go to <strong>Settings</strong> and
              paste this into the{' '}
              <strong>"How would you like Claude to respond?"</strong> field.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={aboutModel}
              onChange={(e) => setAboutModel(e.target.value)}
              className="min-h-[80px] font-mono text-sm"
            />
            <div className="mt-3 flex items-center gap-2">
              <Button onClick={() => handleCopy(aboutModel, setCopiedModel)}>
                {copiedModel ? (
                  <>
                    <Check className="mr-2 h-4 w-4 text-green-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Link to Claude settings */}
      {hasContent && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Import into Claude</CardTitle>
            <CardDescription>
              Open Claude's settings page to paste your custom instructions. You'll
              find two fields: <strong>"What would you like Claude to know about you?"</strong>{' '}
              and <strong>"How would you like Claude to respond?"</strong> — paste
              the sections above into the matching fields.
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
      )}
    </div>
  )
}
