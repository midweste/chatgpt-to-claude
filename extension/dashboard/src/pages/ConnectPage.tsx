/**
 * Connect page — ChatGPT connection via app-store.
 */



import { ConnectionCard } from '@/components/ConnectionCard'
import { useAppStore } from '@/stores/app-store'

export function ConnectPage() {
  const gpt_status = useAppStore((s) => s.gpt_status)
  const gpt_error = useAppStore((s) => s.gpt_error)
  const connect_gpt = useAppStore((s) => s.connect_gpt)
  const disconnect_gpt = useAppStore((s) => s.disconnect_gpt)


  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Connect to ChatGPT</h2>
      <ConnectionCard
        icon="🤖"
        name="ChatGPT"
        subtitle="Source"
        login_url="https://chatgpt.com"
        login_label="ChatGPT"
        status={gpt_status}
        error={gpt_error}
        onConnect={connect_gpt}
        onDisconnect={disconnect_gpt}
      />
    </div>
  )
}
