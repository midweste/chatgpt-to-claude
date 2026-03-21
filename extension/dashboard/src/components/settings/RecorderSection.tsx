/**
 * RecorderSection — API request recorder toggle and viewer.
 *
 * Communicates with the background service worker for recording state and captured data.
 */

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

export function RecorderSection() {
  const [is_recording, setIsRecording] = useState(false)
  const [recordings, setRecordings] = useState('')
  const [recording_count, setRecordingCount] = useState(0)

  const refresh_recordings = useCallback(async () => {
    const result = await chrome.runtime.sendMessage({ action: 'get-recordings' })
    if (result?.recordings) {
      setRecordings(JSON.stringify(result.recordings, null, 2))
      setRecordingCount(result.recordings.length)
    }
  }, [])

  // Check recording state on mount + listen for storage changes (event-driven, no polling)
  useEffect(() => {
    chrome.runtime.sendMessage({ action: 'get-recording-state' }).then((result) => {
      if (result) {
        setIsRecording(result.recording)
        setRecordingCount(result.count)
        if (result.count > 0) refresh_recordings()
      }
    })

    const on_storage_changed = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.recorded_requests) {
        const entries = (changes.recorded_requests.newValue || []) as unknown[]
        if (entries.length > 0) {
          setRecordings(JSON.stringify(entries, null, 2))
          setRecordingCount(entries.length)
        } else {
          setRecordings('')
          setRecordingCount(0)
        }
      }
    }

    chrome.storage.local.onChanged.addListener(on_storage_changed)
    return () => chrome.storage.local.onChanged.removeListener(on_storage_changed)
  }, [refresh_recordings])

  async function toggle_recording(enabled: boolean) {
    if (enabled) {
      await chrome.runtime.sendMessage({ action: 'start-recording' })
      setIsRecording(true)
      setRecordings('')
      setRecordingCount(0)
      toast.success('Recording started — perform actions on ChatGPT or Claude')
    } else {
      await chrome.runtime.sendMessage({ action: 'stop-recording' })
      setIsRecording(false)
      await refresh_recordings()
      toast.success('Recording stopped')
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">Advanced</CardTitle>
        <CardDescription>Debug tools for API discovery</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="recording-toggle" className="text-sm font-medium">
                API Request Recorder
              </Label>
              <p className="text-xs text-muted-foreground">
                {is_recording
                  ? `Recording... (${recording_count} captured)`
                  : 'Record API requests to ChatGPT & Claude'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {is_recording && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                </span>
              )}
              <Switch
                id="recording-toggle"
                checked={is_recording}
                onCheckedChange={toggle_recording}
              />
            </div>
          </div>

          {recording_count > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">
                  Captured Requests ({recording_count})
                </Label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={refresh_recordings}>
                    Refresh
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(recordings)
                      toast.success('Copied to clipboard')
                    }}
                  >
                    Copy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await chrome.runtime.sendMessage({ action: 'clear-recordings' })
                      setRecordings('')
                      setRecordingCount(0)
                      toast.success('Recordings cleared')
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <textarea
                readOnly
                value={recordings}
                className="w-full rounded-md border bg-muted/50 p-3 font-mono text-xs leading-relaxed"
                rows={12}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
