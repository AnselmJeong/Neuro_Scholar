# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Neuro Scholar is an AI-powered academic research assistant for psychiatry and neuroscience professionals. It's an Electron-based macOS desktop application using Ollama Cloud for LLM inference.

**Key Features:**
- Academic literature search (PubMed, Google Scholar)
- DOI-validated citations only
- Professional academic report generation
- Research mode with planning/synthesis pipeline
- Plain chat mode for direct conversation
- File upload support (PDF, MD, QMD)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron App (macOS)                      │
├─────────────────────────────────────────────────────────────┤
│  Renderer Process (React/Vite)     Main Process             │
│  ┌─────────────────────┐          ┌─────────────────────┐   │
│  │ client/             │  <-IPC-> │ electron/           │   │
│  │ ├── components/     │          │ ├── main.ts         │   │
│  │ ├── store/ (Zustand)│          │ ├── db.ts (SQLite)  │   │
│  │ ├── hooks/          │          │ ├── ollama/service  │   │
│  │ └── lib/ipc.ts      │          │ ├── research/       │   │
│  └─────────────────────┘          │ └── tools/          │   │
│                                   └─────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  External: Ollama Cloud (API key required)                   │
│  External: PubMed E-utilities API, Google Scholar            │
└─────────────────────────────────────────────────────────────┘
```

## Build and Run Commands

### Development
```bash
npm install                    # Install root dependencies
cd client && npm install       # Install client dependencies
npm run dev                    # Start Electron + Vite dev server
```

### Production Build
```bash
npm run build                  # Build for production
npm run package:mac           # Package as macOS app (.dmg)
```

## Key Directories

### Electron Main Process (`/electron/`)
- `main.ts` - Electron entry point, window creation, IPC registration
- `preload.ts` - Context bridge for secure IPC communication
- `db.ts` - SQLite database (better-sqlite3) with schema
- `ollama/service.ts` - Ollama Cloud API client with streaming chat
- `research/orchestrator.ts` - Research pipeline (planning → search → synthesis)
- `tools/academic_search.ts` - PubMed and Google Scholar integration
- `tools/file_parser.ts` - PDF, Markdown, Quarto file parsing
- `ipc/` - IPC handlers for chat, settings, research, files

### Client Renderer (`/client/`)
- `src/main.tsx` - React entry point with routing
- `components/` - UI components (Shadcn UI based)
- `store/useChatStore.ts` - Chat and research state management
- `store/useSettingsStore.ts` - Ollama settings and model selection
- `hooks/use-research-events.ts` - IPC event subscription
- `lib/ipc.ts` - IPC wrapper (replaces HTTP API)

## Data Flow

### Research Mode
1. User submits query → IPC `research:start`
2. Main process: Planning Agent creates ToC via Ollama
3. For each section: Academic search (PubMed → Scholar) with DOI filtering
4. Synthesis Agent generates report with inline DOI citations
5. Events streamed to renderer: `plan_created`, `source_found`, `report_chunk`
6. Final report saved to SQLite, displayed in UI

### Plain Chat Mode
- Direct Ollama chat without academic search
- Messages stored in SQLite
- No DOI citations or research pipeline

## Database Schema (SQLite)

```sql
settings (key, value)
chats (id, title, mode: 'research'|'chat', timestamps)
messages (id, chat_id, role, content, metadata JSON)
research_sessions (id, chat_id, status, plan, current_step)
uploaded_files (id, chat_id, filename, file_type, content)
```

## Environment Variables

```bash
OLLAMA_API_KEY=<your-ollama-cloud-key>  # Required for Ollama Cloud
```

Users can also configure API key via Settings UI in the app.

## IPC Channels

**Ollama:**
- `ollama:getModels` - List available models
- `ollama:chat` - Streaming chat with tool support
- `ollama:isInitialized` - Check API key status

**Research:**
- `research:start` - Start research session
- `research:pause`, `research:resume`, `research:cancel`
- Events: `research-update` (plan, sources, chunks)

**Chat:**
- `chat:list`, `chat:create`, `chat:delete`
- `chat:getMessages`, `chat:saveMessage`

**Settings:**
- `settings:get`, `settings:set`
- `settings:setOllamaApiKey` - Reinitializes Ollama client

**Files:**
- `files:upload` - Open dialog, parse, store
- `files:list`, `files:delete`

## Academic Search Priority

1. **PubMed E-utilities API** (primary for biomedical)
   - Search: `esearch.fcgi` with psychiatry/neuroscience MeSH terms
   - Details: `esummary.fcgi` for DOI, authors, journal
   - Abstracts: `efetch.fcgi`

2. **Google Scholar** (fallback via Ollama webSearch)
   - DOI extraction from search results
   - Only sources with valid DOIs are included

## Report Format

- Target audience: Psychiatry/neuroscience researchers
- Professional academic terminology
- Inline DOI citations: `(DOI: 10.xxxx/xxxxx)`
- No footnotes or reference numbers
- Content accuracy prioritized over formatting
