# Neuro Scholar

Neuro Scholar is an AI-powered academic research assistant designed specifically for psychiatry and neuroscience professionals. It leverages Electron and Ollama Cloud to provide a robust desktop application for research synthesis and academic inquiry.

## Features

- **Academic Literature Search**: Integrated search with PubMed and Google Scholar.
- **DOI Verification**: Ensures all citations are validated with DOIs.
- **Professional Reports**: Generates academic-grade reports with appropriate terminology.
- **Research Mode**: A dedicated pipeline for planning, searching, and synthesizing research topics.
- **Chat Mode**: Direct conversation with the LLM for general queries.
- **File Support**: Upload and analyze PDF, Markdown, and Quarto files.

## Architecture

The application is built on the Electron framework (macOS) with a React/Vite renderer and a local SQLite database throughout the main process.

- **Frontend**: React, Vite, TailwindCSS, Shadcn UI
- **Backend (Main Process)**: Electron, SQLite (better-sqlite3), Ollama Cloud SDK
- **AI Inference**: Ollama Cloud

## Getting Started

### Prerequisites

- Node.js (LTS recommended)
- Ollama Cloud API Key

### Installation

1. **Install Dependencies**
   ```bash
   npm install
   cd client && npm install
   ```

2. **Environment Setup**
   Create a `.env` file or configure via the Settings UI in the app:
   ```bash
   OLLAMA_API_KEY=<your-ollama-cloud-key>
   ```

### Running Locally

Start the Electron app with the Vite dev server:

```bash
npm run dev
```

### Building for Production

Build and package the application for macOS (.dmg):

```bash
npm run build
npm run package:mac
```

## Usage

### Research Mode
1. Enter your research query (e.g., "Efficacy of TMS in TRD").
2. The Planning Agent creates a table of contents.
3. The system searches PubMed (primary) and Google Scholar (fallback) for relevant literature.
4. A Synthesis Agent compiles a report with inline DOI citations.

### Chat Mode
Standard chat interface for interacting with the LLM without the rigorous academic search pipeline.

## Structure

- `/electron` - Main process code (DB, Ollama service, Research pipeline)
- `/client` - Renderer process code (React app, Components, Stores)
