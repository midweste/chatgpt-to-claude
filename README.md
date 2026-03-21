<p align="center">
  <img src="docs/assets/hero-banner.png" alt="ChatGPT to Claude Migration" width="100%" />
</p>

<h1 align="center">ChatGPT → Claude Migration</h1>

<p align="center">
  <strong>A Chrome Extension that migrates your conversations, memories, and custom instructions from ChatGPT to Claude — no server required.</strong>
</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/chrome-manifest_v3-blue?logo=googlechrome&logoColor=white" alt="Manifest V3" /></a>
  <a href="#"><img src="https://img.shields.io/badge/react-19-61dafb?logo=react&logoColor=white" alt="React 19" /></a>
  <a href="#"><img src="https://img.shields.io/badge/typescript-5.9-3178c6?logo=typescript&logoColor=white" alt="TypeScript 5.9" /></a>
  <a href="#"><img src="https://img.shields.io/badge/tests-340%20passing-brightgreen?logo=vitest&logoColor=white" alt="340 Tests Passing" /></a>
  <a href="#"><img src="https://img.shields.io/badge/zero-backend-ff69b4" alt="Zero Backend" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" /></a>
</p>

<br />

## ✨ Features

🔄 **Full Migration** — Conversations, memories, and custom instructions  
📂 **Project Mapping** — ChatGPT folders → Claude projects, automatically  
📊 **Built-in Dashboard** — Browse, filter, preview, and select what to migrate  
💾 **Export Options** — Download as ZIP (text or JSON) even without a Claude account  
🔒 **Client-Side Only** — No server, no API keys, no data leaves your browser  
⏸️ **Pause & Resume** — Rate-limit aware queue with auto-pause on 429s  
📋 **Push Tracking** — Knows what's already been pushed, prevents duplicates  
🧠 **Memory Export** — Migrate your ChatGPT memories as a Claude document  
📝 **Instruction Export** — Transfer custom instructions to Claude project prompts  
📜 **Structured Logs** — Full operation log viewable in the dashboard


<br />

## 🖼️ Screenshots

<p align="center">
  <img src="docs/assets/download.png" width="80%" alt="Download conversations from ChatGPT" />
</p>
<p align="center"><em>Step 1 — Download your ChatGPT conversations</em></p>

<p align="center">
  <img src="docs/assets/connect-claude.png" width="80%" alt="Connect to Claude" />
</p>
<p align="center"><em>Step 2 — Connect to Claude and configure import settings</em></p>

<p align="center">
  <img src="docs/assets/migrate.png" width="80%" alt="Migrate conversations" />
</p>
<p align="center"><em>Step 3 — Select and migrate conversations to Claude</em></p>

<br />

## 📥 Install

No build tools required — just download and load.

1. **Download** the latest `chatgpt-to-claude-v*.zip` from the [Releases page](../../releases/latest)
2. **Unzip** the archive
3. Open Chrome → navigate to `chrome://extensions` → enable **Developer Mode**
4. Click **Load unpacked** → select the unzipped `chatgpt-to-claude` folder
5. Click the extension icon in the toolbar to open the dashboard

### How It Works

1. **Connect** — Log into ChatGPT and Claude in your browser (the extension uses your existing sessions)
2. **Extract** — Download your conversations, memories, and instructions from ChatGPT
3. **Browse** — Filter, search, and select which items to migrate
4. **Migrate** — Push selected items to Claude, or download as ZIP files

<br />

## 🔒 Security & Privacy

- **No stored credentials** — session cookies accessed at runtime, never saved
- **No server** — everything runs locally in your browser
- **No API keys** — uses your existing ChatGPT and Claude sessions
- **Domain allowlist** — only connects to `chatgpt.com` and `claude.ai`
- **Sender verification** — background worker rejects non-extension requests
- **Local storage** — all data in extension-scoped IndexedDB, clearable from Settings

<br />

## 🏗️ Architecture

```
extension/
├── manifest.json           # Chrome MV3 manifest
├── background.ts           # Service worker — API proxy, cookie access, domain allowlist
├── lib/                    # ⭐ Shared library (React-free, DOM-free)
│   ├── sources/            # ChatGPT adapter (auth, extraction)
│   ├── destinations/       # Claude adapter (auth, push, projects)
│   ├── services/           # Business logic (extraction, migration, export)
│   ├── storage/            # IndexedDB persistence (repositories)
│   ├── transform/          # GPT → Claude format conversion
│   └── utils/              # Retry, SSE parsing, timestamps
└── dashboard/              # React 19 + Vite SPA
    └── src/
        ├── pages/          # 11 pages (Connect → Extract → Browse → Migrate → ...)
        ├── stores/         # Zustand state management
        └── components/     # UI components + shadcn/Radix primitives
```

### Design Decisions

| Decision        | Why                                                                      |
| --------------- | ------------------------------------------------------------------------ |
| **No backend**  | Session cookies via `chrome.cookies`, proxied through the service worker |
| **No API keys** | Uses existing ChatGPT/Claude browser sessions                            |
| **Shared lib**  | Business logic is React-free — testable and framework-independent        |
| **IndexedDB**   | Extension-scoped, clearable from Settings, no localStorage               |

<br />

## 📦 Tech Stack

| Layer         | Technology                         |
| ------------- | ---------------------------------- |
| **Extension** | Chrome Manifest V3, Service Worker |
| **Frontend**  | React 19, TypeScript 5.9, Vite 7   |
| **Styling**   | TailwindCSS v4, shadcn/ui (Radix)  |
| **State**     | Zustand 5                          |
| **Tables**    | TanStack Table v8                  |
| **Testing**   | Vitest, 340 tests, v8 coverage     |

<br />

## 🛠️ Development

For contributors who want to build from source:

### Prerequisites

- **Node.js** ≥ 20
- **npm**

### Setup

```bash
git clone https://github.com/midweste/chatgpt-to-claude.git
cd chatgpt-to-claude
npm install
cd extension/dashboard && npm install && cd ../..
```

### Commands

| Command         | What it does                           |
| --------------- | -------------------------------------- |
| `make dev`      | Start Vite dev server with HMR         |
| `make build`    | Build dashboard + background worker    |
| `make release`  | Build and package as distributable ZIP |
| `make test`     | Run tests                              |
| `make coverage` | Tests + v8 coverage report             |
| `make clean`    | Remove build artifacts                 |

### Loading for Development

1. `make build`
2. Chrome → `chrome://extensions` → Developer Mode
3. **Load unpacked** → select `extension/`
4. Dashboard changes hot-reload with `make dev`, but background worker changes need `make build` + extension reload

<br />

## 📄 License

[MIT](LICENSE)

<br />

## ⚖️ Disclaimer

This is an independent, open-source project. It is **not affiliated with, endorsed by, or sponsored by OpenAI or Anthropic**.

- "ChatGPT" is a trademark of OpenAI. "Claude" is a trademark of Anthropic. These names are used solely for descriptive purposes to identify the platforms this tool interacts with.
- This extension acts on behalf of **you, the authenticated user** — it uses your own browser sessions to access your own data. It does not bypass authentication, circumvent access controls, or access other users' data.
- **Your data belongs to you.** This tool helps you export and migrate your own conversations, memories, and instructions. No data is sent to any third-party server.
- Users are responsible for reviewing and complying with the terms of service of any platforms they use this extension with.
- This project is provided "as is" without warranty. See [LICENSE](LICENSE) for details.

<br />

---

<p align="center">
  Built with ❤️ to help people own their AI conversation history.
</p>
