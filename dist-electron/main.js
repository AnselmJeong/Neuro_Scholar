import { app, dialog, BrowserWindow, shell, ipcMain } from "electron";
import * as path from "path";
import * as dotenv from "dotenv";
import Database from "better-sqlite3";
import { Ollama } from "ollama";
import { v4 } from "uuid";
import * as fs from "fs";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
let db = null;
function initializeDb() {
  const userDataPath = app.getPath("userData");
  const dbPath = path.join(userDataPath, "neuro-scholar.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    -- Settings table for API keys and preferences
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- Chats table
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      title TEXT,
      mode TEXT DEFAULT 'research' CHECK (mode IN ('research', 'chat')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Messages table
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,
      role TEXT CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Research sessions table
    CREATE TABLE IF NOT EXISTS research_sessions (
      id TEXT PRIMARY KEY,
      chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'cancelled', 'completed')),
      query TEXT,
      plan TEXT,
      current_step INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Uploaded files table
    CREATE TABLE IF NOT EXISTS uploaded_files (
      id TEXT PRIMARY KEY,
      chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,
      filename TEXT,
      file_type TEXT CHECK (file_type IN ('pdf', 'md', 'qmd')),
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes for better query performance
    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_research_sessions_chat_id ON research_sessions(chat_id);
    CREATE INDEX IF NOT EXISTS idx_uploaded_files_chat_id ON uploaded_files(chat_id);
  `);
  console.log("[DB] Database initialized at:", dbPath);
  return db;
}
function getDb() {
  if (!db) {
    throw new Error("Database not initialized. Call initializeDb() first.");
  }
  return db;
}
function closeDb() {
  if (db) {
    db.close();
    db = null;
    console.log("[DB] Database closed");
  }
}
function getSetting(key) {
  const db2 = getDb();
  const row = db2.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}
function setSetting(key, value) {
  const db2 = getDb();
  db2.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}
function getAllSettings() {
  const db2 = getDb();
  const rows = db2.prepare("SELECT key, value FROM settings").all();
  return rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}
const OLLAMA_CLOUD_URL = "https://api.ollama.com";
let client = null;
function createClient(apiKey) {
  if (!apiKey) {
    throw new Error("Ollama Cloud API key is required");
  }
  return new Ollama({
    host: OLLAMA_CLOUD_URL,
    headers: {
      Authorization: `Bearer ${apiKey.replace(/"/g, "").trim()}`
    }
  });
}
const ollamaService = {
  /**
   * Initialize the Ollama client with API key from settings or env
   */
  initialize() {
    try {
      const dbKey = getSetting("ollamaApiKey");
      const envKey = process.env.OLLAMA_API_KEY || process.env.Ollama_API_KEY;
      const apiKey = dbKey || envKey;
      if (!apiKey) {
        console.log("[OllamaService] No API key found. User must configure in settings.");
        return false;
      }
      console.log("[OllamaService] Initializing with API Key from " + (dbKey ? "DB" : "ENV"));
      client = createClient(apiKey);
      return true;
    } catch (e) {
      console.error("[OllamaService] Init failed:", e);
      return false;
    }
  },
  /**
   * Update the API key and reinitialize client
   */
  updateApiKey(key) {
    console.log("[OllamaService] Updating API Key");
    setSetting("ollamaApiKey", key);
    client = createClient(key);
  },
  /**
   * Check if the client is initialized
   */
  isInitialized() {
    return client !== null;
  },
  /**
   * Get available models from Ollama Cloud
   */
  async getModels() {
    if (!client) {
      console.warn("[OllamaService] Client not initialized");
      return [];
    }
    try {
      const response = await client.list();
      return (response.models || []).map((model) => ({
        ...model,
        modified_at: typeof model.modified_at === "string" ? model.modified_at : new Date(model.modified_at).toISOString()
      }));
    } catch (error) {
      console.error("[OllamaService] Error fetching models:", error);
      return [];
    }
  },
  /**
   * Chat with Ollama (streaming)
   * Returns an async generator that yields chunks
   */
  async *chatStream(payload) {
    if (!client) {
      yield { error: "Ollama client not initialized. Please set API key in settings.", done: true };
      return;
    }
    console.log(`
--- [OllamaService] Chat Request ---`);
    console.log(`Model: ${payload.model}`);
    try {
      const messages = [...payload.messages];
      const tools = payload.tools;
      let iterationCount = 0;
      const MAX_ITERATIONS = 5;
      while (iterationCount < MAX_ITERATIONS) {
        iterationCount++;
        const response = await client.chat({
          model: payload.model,
          messages,
          tools,
          stream: true
        });
        let assistantContent = "";
        let assistantThinking = "";
        let toolCalls = [];
        for await (const chunk of response) {
          if (chunk.message.thinking) assistantThinking += chunk.message.thinking;
          if (chunk.message.content) assistantContent += chunk.message.content;
          if (chunk.message.tool_calls) toolCalls = [...toolCalls, ...chunk.message.tool_calls];
          yield {
            content: chunk.message.content || "",
            thinking: chunk.message.thinking || "",
            tool_calls: chunk.message.tool_calls,
            done: false
          };
        }
        if (toolCalls.length > 0) {
          messages.push({
            role: "assistant",
            content: assistantContent,
            thinking: assistantThinking,
            tool_calls: toolCalls
          });
          for (const toolCall of toolCalls) {
            try {
              console.log(`[OllamaService] Executing tool: ${toolCall.function.name}`);
              let output;
              if (toolCall.function.name === "webSearch") {
                output = await client.webSearch({ query: toolCall.function.arguments.query });
              } else if (toolCall.function.name === "webFetch") {
                output = await client.webFetch({ url: toolCall.function.arguments.url });
              }
              messages.push({
                role: "tool",
                content: JSON.stringify(output)
              });
            } catch (toolError) {
              console.error(`[OllamaService] Tool Execution Error (${toolCall.function.name}):`, toolError.message || toolError);
              const errorMsg = toolError.status_code === 401 ? "Unauthorized: Please verify your Ollama API Key in settings." : toolError.message || "Tool execution failed";
              messages.push({
                role: "tool",
                content: JSON.stringify({ error: errorMsg })
              });
            }
          }
          continue;
        }
        yield { done: true };
        return;
      }
      yield { error: "Maximum tool iterations reached", done: true };
    } catch (error) {
      console.error("[OllamaService] Chat Error:", error);
      yield { error: error.message, done: true };
    }
  },
  /**
   * Non-streaming chat for internal use (planning, synthesis)
   */
  async chat(payload) {
    let content = "";
    let thinking = "";
    for await (const chunk of this.chatStream(payload)) {
      if (chunk.error) {
        throw new Error(chunk.error);
      }
      if (chunk.content) content += chunk.content;
      if (chunk.thinking) thinking += chunk.thinking;
    }
    return { content, thinking };
  },
  /**
   * Web search using Ollama Cloud
   */
  async webSearch(query) {
    if (!client) {
      throw new Error("Ollama client not initialized");
    }
    try {
      const result = await client.webSearch({ query });
      return result;
    } catch (error) {
      console.error("[OllamaService] Web search error:", error);
      throw error;
    }
  },
  /**
   * Web fetch using Ollama Cloud
   */
  async webFetch(url) {
    if (!client) {
      throw new Error("Ollama client not initialized");
    }
    try {
      const result = await client.webFetch({ url });
      return result;
    } catch (error) {
      console.error("[OllamaService] Web fetch error:", error);
      throw error;
    }
  }
};
function registerOllamaHandlers(ipcMain2) {
  ipcMain2.handle("ollama:getModels", async () => {
    return await ollamaService.getModels();
  });
  ipcMain2.handle("ollama:isInitialized", () => {
    return ollamaService.isInitialized();
  });
  ipcMain2.handle("ollama:chat", async (event, payload) => {
    const mainWindow2 = getMainWindow();
    let fullContent = "";
    let fullThinking = "";
    try {
      for await (const chunk of ollamaService.chatStream(payload)) {
        if (mainWindow2 && !mainWindow2.isDestroyed()) {
          mainWindow2.webContents.send("ollama-chat-chunk", chunk);
        }
        if (chunk.content) fullContent += chunk.content;
        if (chunk.thinking) fullThinking += chunk.thinking;
        if (chunk.error) {
          throw new Error(chunk.error);
        }
      }
      return { content: fullContent, thinking: fullThinking };
    } catch (error) {
      console.error("[IPC:Ollama] Chat error:", error);
      throw error;
    }
  });
  ipcMain2.handle("ollama:chatDirect", async (_event, payload) => {
    return await ollamaService.chat(payload);
  });
  ipcMain2.handle("ollama:webSearch", async (_event, query) => {
    return await ollamaService.webSearch(query);
  });
  ipcMain2.handle("ollama:webFetch", async (_event, url) => {
    return await ollamaService.webFetch(url);
  });
  console.log("[IPC] Ollama handlers registered");
}
function registerChatHandlers(ipcMain2) {
  const db2 = getDb();
  ipcMain2.handle("chat:list", () => {
    const chats = db2.prepare(
      `SELECT id, title, mode, created_at, updated_at
         FROM chats
         ORDER BY updated_at DESC`
    ).all();
    return chats;
  });
  ipcMain2.handle("chat:create", (_event, mode = "research") => {
    const id = v4();
    const title = mode === "research" ? "New Research" : "New Chat";
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db2.prepare(
      `INSERT INTO chats (id, title, mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, title, mode, now, now);
    return {
      id,
      title,
      mode,
      created_at: now,
      updated_at: now
    };
  });
  ipcMain2.handle("chat:get", (_event, chatId) => {
    const chat = db2.prepare("SELECT * FROM chats WHERE id = ?").get(chatId);
    if (!chat) {
      throw new Error(`Chat not found: ${chatId}`);
    }
    return chat;
  });
  ipcMain2.handle("chat:update", (_event, chatId, updates) => {
    const fields = [];
    const values = [];
    if (updates.title !== void 0) {
      fields.push("title = ?");
      values.push(updates.title);
    }
    if (updates.mode !== void 0) {
      fields.push("mode = ?");
      values.push(updates.mode);
    }
    fields.push("updated_at = ?");
    values.push((/* @__PURE__ */ new Date()).toISOString());
    values.push(chatId);
    db2.prepare(`UPDATE chats SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  });
  ipcMain2.handle("chat:delete", (_event, chatId) => {
    db2.prepare("DELETE FROM chats WHERE id = ?").run(chatId);
  });
  ipcMain2.handle("chat:getMessages", (_event, chatId) => {
    const messages = db2.prepare(
      `SELECT id, chat_id, role, content, metadata, created_at
         FROM messages
         WHERE chat_id = ?
         ORDER BY created_at ASC`
    ).all(chatId);
    return messages.map((msg) => ({
      ...msg,
      metadata: msg.metadata ? JSON.parse(msg.metadata) : null
    }));
  });
  ipcMain2.handle(
    "chat:saveMessage",
    (_event, chatId, message) => {
      const id = v4();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const metadataStr = message.metadata ? JSON.stringify(message.metadata) : null;
      db2.prepare(
        `INSERT INTO messages (id, chat_id, role, content, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, chatId, message.role, message.content, metadataStr, now);
      db2.prepare("UPDATE chats SET updated_at = ? WHERE id = ?").run(now, chatId);
      return {
        id,
        chat_id: chatId,
        role: message.role,
        content: message.content,
        metadata: message.metadata || null,
        created_at: now
      };
    }
  );
  ipcMain2.handle("chat:deleteMessage", (_event, messageId) => {
    db2.prepare("DELETE FROM messages WHERE id = ?").run(messageId);
  });
  console.log("[IPC] Chat handlers registered");
}
function registerSettingsHandlers(ipcMain2) {
  ipcMain2.handle("settings:get", () => {
    return getAllSettings();
  });
  ipcMain2.handle("settings:set", (_event, key, value) => {
    setSetting(key, value);
  });
  ipcMain2.handle("settings:getSingle", (_event, key) => {
    return getSetting(key);
  });
  ipcMain2.handle("settings:setOllamaApiKey", (_event, key) => {
    ollamaService.updateApiKey(key);
    console.log("[Settings] Ollama API key updated");
  });
  ipcMain2.handle("settings:getSelectedModel", () => {
    return getSetting("selectedOllamaModel") || "llama3.2";
  });
  ipcMain2.handle("settings:setSelectedModel", (_event, model) => {
    setSetting("selectedOllamaModel", model);
  });
  console.log("[IPC] Settings handlers registered");
}
const PUBMED_SEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const PUBMED_FETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
const PUBMED_SUMMARY_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";
const DOI_REGEX = /10\.\d{4,}\/[^\s<>"]+/g;
class AcademicSearchTool {
  maxResults = 20;
  /**
   * Search for academic sources
   * Priority: PubMed first, then Google Scholar via Ollama webSearch
   * Only returns sources with DOIs
   */
  async search(query) {
    const results = [];
    console.log(`[AcademicSearch] Searching PubMed for: ${query}`);
    try {
      const pubmedResults = await this.searchPubMed(query);
      results.push(...pubmedResults);
      console.log(`[AcademicSearch] PubMed returned ${pubmedResults.length} results`);
    } catch (error) {
      console.error("[AcademicSearch] PubMed search error:", error);
    }
    if (results.length < 10 && ollamaService.isInitialized()) {
      console.log(`[AcademicSearch] Searching Google Scholar for: ${query}`);
      try {
        const scholarResults = await this.searchGoogleScholar(query);
        results.push(...scholarResults);
        console.log(`[AcademicSearch] Google Scholar returned ${scholarResults.length} results`);
      } catch (error) {
        console.error("[AcademicSearch] Google Scholar search error:", error);
      }
    }
    const withDoi = results.filter((r) => r.doi && r.doi.length > 0);
    console.log(`[AcademicSearch] Total results with DOI: ${withDoi.length}`);
    const uniqueByDoi = Array.from(new Map(withDoi.map((r) => [r.doi, r])).values());
    return uniqueByDoi.slice(0, this.maxResults);
  }
  /**
   * Build tiered PubMed queries from keywords, progressively broadening.
   * Tier 1: All keywords AND'd together (most specific)
   * Tier 2: First keyword AND (remaining keywords OR'd) (balanced)
   * Tier 3: All keywords OR'd together (broadest)
   */
  buildTieredQueries(keywords) {
    if (keywords.length === 0) return [];
    if (keywords.length === 1) return [keywords[0]];
    const quoted = keywords.map((k) => `(${k})`);
    const queries = [];
    queries.push(quoted.join(" AND "));
    if (keywords.length > 2) {
      const primary = quoted[0];
      const rest = quoted.slice(1).join(" OR ");
      queries.push(`${primary} AND (${rest})`);
    }
    queries.push(quoted.join(" OR "));
    return queries;
  }
  /**
   * Search PubMed using E-utilities API with tiered query broadening.
   * Splits comma-separated keywords and tries progressively broader
   * queries until results are found.
   */
  async searchPubMed(query) {
    const keywords = query.split(",").map((k) => k.trim()).filter(Boolean);
    const queries = keywords.length > 1 ? this.buildTieredQueries(keywords) : [query];
    for (const q of queries) {
      console.log(`[AcademicSearch] PubMed trying query: ${q}`);
      const results = await this.executePubMedSearch(q);
      if (results.length > 0) {
        console.log(`[AcademicSearch] PubMed got ${results.length} results with query: ${q}`);
        return results;
      }
    }
    return [];
  }
  /**
   * Execute a single PubMed search query and return parsed results.
   */
  async executePubMedSearch(query) {
    const searchUrl = new URL(PUBMED_SEARCH_URL);
    searchUrl.searchParams.set("db", "pubmed");
    searchUrl.searchParams.set("term", query);
    searchUrl.searchParams.set("retmax", String(this.maxResults));
    searchUrl.searchParams.set("retmode", "json");
    searchUrl.searchParams.set("sort", "relevance");
    const searchResponse = await fetch(searchUrl.toString());
    if (!searchResponse.ok) {
      throw new Error(`PubMed search failed: ${searchResponse.status}`);
    }
    const searchData = await searchResponse.json();
    const pmids = searchData.esearchresult?.idlist || [];
    if (pmids.length === 0) {
      return [];
    }
    const summaryUrl = new URL(PUBMED_SUMMARY_URL);
    summaryUrl.searchParams.set("db", "pubmed");
    summaryUrl.searchParams.set("id", pmids.join(","));
    summaryUrl.searchParams.set("retmode", "json");
    const summaryResponse = await fetch(summaryUrl.toString());
    if (!summaryResponse.ok) {
      throw new Error(`PubMed summary failed: ${summaryResponse.status}`);
    }
    const summaryData = await summaryResponse.json();
    const results = [];
    for (const pmid of pmids) {
      const article = summaryData.result?.[pmid];
      if (!article || article.error) continue;
      let doi = "";
      const articleIds = article.articleids || [];
      for (const idObj of articleIds) {
        if (idObj.idtype === "doi") {
          doi = idObj.value;
          break;
        }
      }
      if (!doi) continue;
      const authors = (article.authors || []).map((a) => a.name);
      const pubDate = article.pubdate || article.sortpubdate || "";
      const yearMatch = pubDate.match(/\d{4}/);
      const year = yearMatch ? parseInt(yearMatch[0]) : 0;
      results.push({
        title: article.title || "",
        authors,
        journal: article.fulljournalname || article.source || "",
        year,
        doi,
        abstract: "",
        // Summary API doesn't include abstract
        url: `https://doi.org/${doi}`,
        source: "pubmed"
      });
    }
    if (results.length > 0) {
      await this.fetchPubMedAbstracts(results);
    }
    return results;
  }
  /**
   * Fetch abstracts from PubMed
   */
  async fetchPubMedAbstracts(results) {
    const pmids = [];
    for (const result of results) {
      const searchUrl = new URL(PUBMED_SEARCH_URL);
      searchUrl.searchParams.set("db", "pubmed");
      searchUrl.searchParams.set("term", `${result.doi}[doi]`);
      searchUrl.searchParams.set("retmode", "json");
      try {
        const response = await fetch(searchUrl.toString());
        const data = await response.json();
        const ids = data.esearchresult?.idlist || [];
        if (ids.length > 0) {
          pmids.push(ids[0]);
        }
      } catch {
      }
    }
    if (pmids.length === 0) return;
    const fetchUrl = new URL(PUBMED_FETCH_URL);
    fetchUrl.searchParams.set("db", "pubmed");
    fetchUrl.searchParams.set("id", pmids.join(","));
    fetchUrl.searchParams.set("rettype", "abstract");
    fetchUrl.searchParams.set("retmode", "text");
    try {
      const response = await fetch(fetchUrl.toString());
      const text = await response.text();
      const articles = text.split(/\n\n\d+\./);
      for (let i = 0; i < Math.min(articles.length, results.length); i++) {
        const abstractMatch = articles[i].match(/(?:Abstract|ABSTRACT)\s*([\s\S]*?)(?=\n\n|PMID:|$)/i);
        if (abstractMatch) {
          results[i].abstract = abstractMatch[1].trim().slice(0, 1e3);
        }
      }
    } catch (error) {
      console.error("[AcademicSearch] Failed to fetch abstracts:", error);
    }
  }
  /**
   * Search Google Scholar via Ollama Cloud webSearch
   */
  async searchGoogleScholar(query) {
    const scholarQuery = `${query} academic research paper`;
    try {
      const searchResult = await ollamaService.webSearch(scholarQuery);
      const results = [];
      const items = searchResult?.results || searchResult?.webPages?.value || [];
      for (const item of items) {
        const title = item.title || item.name || "";
        const snippet = item.snippet || item.description || "";
        const url = item.url || item.link || "";
        const doiMatches = (url + " " + snippet).match(DOI_REGEX);
        const doi = doiMatches ? doiMatches[0] : "";
        if (!doi) continue;
        const yearMatch = snippet.match(/\b(19|20)\d{2}\b/);
        const year = yearMatch ? parseInt(yearMatch[0]) : 0;
        results.push({
          title: title.replace(/\s*-\s*Google Scholar.*$/, ""),
          authors: [],
          // Can't reliably extract from search
          journal: "",
          year,
          doi,
          abstract: snippet,
          url: `https://doi.org/${doi}`,
          source: "scholar"
        });
      }
      return results;
    } catch (error) {
      console.error("[AcademicSearch] Scholar search error:", error);
      return [];
    }
  }
  /**
   * Validate and resolve DOI
   */
  async validateDoi(doi) {
    try {
      const response = await fetch(`https://doi.org/api/handles/${doi}`, {
        method: "HEAD"
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  /**
   * Extract DOIs from text
   */
  extractDois(text) {
    const matches = text.match(DOI_REGEX);
    return matches ? [...new Set(matches)] : [];
  }
}
function normalizeDoi(doi) {
  let normalized = doi.trim();
  normalized = normalized.replace(/\]\(https?:\/\/doi\.org\/[^)\s]+$/i, "").replace(/\]\(https?:\/\/dx\.doi\.org\/[^)\s]+$/i, "");
  normalized = normalized.replace(/^doi:\s*/i, "").replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
  if (/%[0-9A-Fa-f]{2}/.test(normalized)) {
    try {
      normalized = decodeURIComponent(normalized);
    } catch {
    }
  }
  normalized = normalized.replace(/[.,;:!?)+\]]+$/, "").trim();
  return normalized;
}
function toDoiUrl(doi) {
  const encoded = encodeURIComponent(doi).replace(/%2F/gi, "/");
  return `https://doi.org/${encoded}`;
}
function formatCitationLinkTextFromFallback(fallback) {
  const year = fallback.year && fallback.year > 0 ? String(fallback.year) : "n.d.";
  const authors = fallback.authors || [];
  if (authors.length === 0) return `Unknown ${year}`;
  const firstAuthor = getLastName(authors[0]);
  if (authors.length === 1) return `${firstAuthor} ${year}`;
  if (authors.length === 2) return `${firstAuthor} and ${getLastName(authors[1])} ${year}`;
  return `${firstAuthor} et al. ${year}`;
}
function getLastName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}
function filterAndFormatCitationsWithSourceDois(content, fallbackByDoi) {
  const cited = [];
  const removed = [];
  let processedContent = content;
  const citationPatterns = [
    /\(DOI:\s*(10\.\d{4,}\/[^\s<>")\]]+)\)/gi,
    /\[DOI:\s*(10\.\d{4,}\/[^\s<>")\]]+)\]/gi,
    /\(\[DOI:\s*(10\.\d{4,}\/[^\s<>")\]]+)\]\)/gi
  ];
  for (const pattern of citationPatterns) {
    processedContent = processedContent.replace(pattern, (_match, doi) => {
      const cleanDoi = normalizeDoi(doi);
      const fallback = fallbackByDoi.get(cleanDoi);
      if (!fallback) {
        removed.push(cleanDoi);
        return "";
      }
      cited.push(cleanDoi);
      const label = formatCitationLinkTextFromFallback(fallback);
      return `([${label}](${toDoiUrl(cleanDoi)}))`;
    });
  }
  processedContent = processedContent.replace(
    /\[DOI:\s*(10\.\d{4,}\/[^\]]+)\]\([^)]+\)/gi,
    (_match, doi) => {
      const cleanDoi = normalizeDoi(doi);
      const fallback = fallbackByDoi.get(cleanDoi);
      if (!fallback) {
        removed.push(cleanDoi);
        return "";
      }
      cited.push(cleanDoi);
      const label = formatCitationLinkTextFromFallback(fallback);
      return `[${label}](${toDoiUrl(cleanDoi)})`;
    }
  );
  return {
    processedContent,
    citedDois: [...new Set(cited)],
    removedDois: [...new Set(removed)]
  };
}
function generateReferencesSection(citedDois, validatedDois, fallbackByDoi = /* @__PURE__ */ new Map(), language = "en") {
  const title = language === "ko" ? "## 참고문헌" : "## References";
  const uniqueCitedDois = [...new Set(citedDois)];
  const refLines = uniqueCitedDois.map((rawDoi) => {
    const doi = normalizeDoi(rawDoi);
    const validated = validatedDois.get(doi);
    if (validated) {
      const authorsStr2 = validated.authors.length > 0 ? validated.authors.slice(0, 3).join(", ") + (validated.authors.length > 3 ? ", et al." : "") : "Unknown";
      const yearStr2 = validated.year > 0 ? String(validated.year) : "n.d.";
      return `- ${authorsStr2}. ${yearStr2}. ${validated.title || "Untitled"}. *${validated.journal || "Unknown Journal"}*. [DOI: ${validated.doi}](${toDoiUrl(validated.doi)})`;
    }
    const fallback = fallbackByDoi.get(doi);
    const authorsStr = fallback?.authors && fallback.authors.length > 0 ? fallback.authors.slice(0, 3).join(", ") + (fallback.authors.length > 3 ? ", et al." : "") : "Unknown";
    const yearStr = fallback?.year && fallback.year > 0 ? String(fallback.year) : "n.d.";
    const titleStr = fallback?.title || "Untitled";
    const journalStr = fallback?.journal || "Unknown Journal";
    return `- ${authorsStr}. ${yearStr}. ${titleStr}. *${journalStr}*. [DOI: ${doi}](${toDoiUrl(doi)})`;
  });
  return `${title}

${refLines.join("\n\n")}
`;
}
const PLANNING_PROMPTS = {
  en: `You are an expert research planner specializing in psychiatry and neuroscience.
Given a research query, create a detailed Table of Contents for a comprehensive academic review.

Requirements:
1. Focus on psychiatry, neuroscience, and related biomedical fields
2. Each section should be specific enough to guide targeted literature searches
3. Include sections for: Background/Context, Key Findings, Methodological Considerations, Clinical Implications
4. Use professional academic terminology
5. Aim for 4-6 focused sections
6. IMPORTANT: Do NOT include "Executive Summary", "Summary", "Abstract", "References", or "Bibliography" sections - these are generated automatically

Respond with a JSON object in this exact format:
{
  "sections": [
    {"title": "Section Title", "description": "Brief description of what this section covers"}
  ]
}`,
  ko: `당신은 정신의학과 신경과학을 전문으로 하는 연구 계획 전문가입니다.
연구 질문이 주어지면, 종합적인 학술 리뷰를 위한 상세한 목차를 작성하세요.

요구사항:
1. 정신의학, 신경과학 및 관련 생의학 분야에 집중
2. 각 섹션은 타겟 문헌 검색을 안내할 수 있을 정도로 구체적이어야 함
3. 다음 섹션 포함: 배경/맥락, 주요 연구 결과, 방법론적 고려사항, 임상적 함의
4. 전문적인 학술 용어 사용
5. 4-6개의 집중된 섹션 목표
6. 중요: "요약", "Executive Summary", "참고문헌", "References" 섹션은 포함하지 마세요 - 자동으로 생성됩니다
7. CRITICAL: 섹션 제목과 설명을 반드시 한국어로 작성하세요

다음 형식의 JSON 객체로 응답하세요:
{
  "sections": [
    {"title": "섹션 제목", "description": "이 섹션에서 다루는 내용에 대한 간략한 설명"}
  ]
}`
};
const SYNTHESIS_PROMPTS = {
  en: `You are a senior academic researcher writing for psychiatry and neuroscience professionals.

CRITICAL REQUIREMENTS:
1. Use professional medical/scientific terminology appropriate for peer-reviewed literature
2. Prioritize accuracy and precision over accessibility
3. Every factual claim MUST include an inline DOI citation in this exact format: (DOI: 10.xxxx/xxxxx)
4. Do NOT use footnotes or reference numbers - insert DOI directly at the point of citation
5. Synthesize findings across sources; do not simply summarize each source
6. If sources contradict each other, acknowledge the controversy with both DOIs
7. Focus on methodology quality and evidence strength
8. Write in formal academic prose suitable for a review article
9. CRITICAL: Do NOT include section titles, headers, or markdown formatting (##) in your response - write only the body content

DOI ACCURACY (EXTREMELY IMPORTANT):
- ONLY use DOIs that are explicitly provided in the source list
- NEVER fabricate, guess, or modify DOIs
- If unsure about a DOI, omit the citation rather than inventing one
- Copy DOIs exactly as provided - character for character

Example citation format:
"Hippocampal volume reduction has been consistently observed in treatment-resistant depression (DOI: 10.1016/j.biopsych.2021.02.123), though the causal relationship remains unclear (DOI: 10.1038/s41593-2022-01234)."`,
  ko: `당신은 정신의학 및 신경과학 전문가를 위해 글을 쓰는 선임 학술 연구자입니다.

중요 요구사항:
1. 동료 심사 문헌에 적합한 전문 의학/과학 용어 사용
2. 접근성보다 정확성과 정밀성 우선
3. 모든 사실적 주장에는 반드시 다음 형식의 인라인 DOI 인용 포함: (DOI: 10.xxxx/xxxxx)
4. 각주나 참조 번호 사용 금지 - 인용 시점에 DOI 직접 삽입
5. 각 출처를 단순히 요약하지 말고 여러 출처의 결과를 종합
6. 출처 간 상충하는 내용이 있으면 양쪽 DOI와 함께 논쟁점 인정
7. 방법론의 질과 증거의 강도에 집중
8. 리뷰 논문에 적합한 공식적인 학술 문체로 작성
9. CRITICAL: 보고서의 모든 본문을 반드시 한국어로 작성하세요 (Write all content in Korean)
10. DOI, 논문 제목, 저자명은 원문(영어) 그대로 유지하세요
11. CRITICAL: Do NOT include section titles, headers, or markdown formatting (##) in your response - write only the body content

DOI 정확성 (매우 중요):
- 반드시 출처 목록에 명시된 DOI만 사용하세요
- DOI를 절대로 만들어내거나, 추측하거나, 수정하지 마세요
- DOI가 확실하지 않으면 인용을 생략하세요
- DOI를 글자 그대로 정확히 복사하세요

인용 형식 예시:
"항우울제 치료와 관련하여 해마 부피 감소가 일관되게 관찰되었다 (DOI: 10.1016/j.biopsych.2021.02.123), 그러나 인과 관계는 여전히 불분명하다 (DOI: 10.1038/s41593-2022-01234)."`
};
const KEYWORD_PROMPTS = {
  en: `You are an expert academic search specialist. Given a research section title and description, generate exactly 4 most important search keywords for finding relevant academic papers.

Requirements:
1. Select ONLY the 4 most critical keywords that best represent the core concepts
2. Order keywords by importance — put the MOST IMPORTANT keyword first
3. Use scientific/medical terminology appropriate for PubMed searches
4. Include specific technical terms, drug names, brain regions, or methodologies when relevant
5. Return ONLY a comma-separated list of 4 keywords (no explanations, no bullet points)
6. Prioritize precision over quantity - 4 carefully chosen keywords are better than many generic ones

Example output format:
neuroplasticity, structural MRI, depression treatment, BDNF`,
  ko: `당신은 학술 검색 전문가입니다. 연구 섹션 제목과 설명이 주어지면, 관련 학술 논문을 찾기 위한 가장 중요한 4개의 검색 키워드를 생성하세요.

요구사항:
1. 핵심 개념을 가장 잘 대표하는 4개의 가장 중요한 키워드만 선택하세요
2. 키워드를 중요도 순으로 정렬하세요 — 가장 중요한 키워드를 첫 번째에 놓으세요
3. PubMed 검색에 적합한 과학/의학 용어를 사용하세요
4. 관련된 기술 용어, 약물명, 뇌 영역, 또는 방법론을 포함하세요
5. 오직 쉼표로 구분된 4개 키워드 목록만 반환하세요 (설명 없음, 글머리 기호 없음)
6. 양보다 질을 우선시하세요 - 여러 개의 일반적인 키워드보다 4개의 신중하게 선택된 키워드가 더 좋습니다

출력 형식 예시:
neuroplasticity, structural MRI, depression treatment, BDNF`
};
class ResearchOrchestrator {
  academicSearch;
  activeSession = null;
  abortController = null;
  isPaused = false;
  constructor() {
    this.academicSearch = new AcademicSearchTool();
  }
  /**
   * Remove any LLM-generated references/bibliography block from section text.
   * The app generates a single canonical References section at the end.
   */
  stripInlineReferencesBlock(text) {
    const lines = text.split("\n");
    const markerIndex = lines.findIndex((line) => {
      const t = line.trim().toLowerCase();
      return t === "references" || t === "bibliography" || t === "참고문헌" || t === "works cited" || t.startsWith("references:") || t.startsWith("bibliography:") || t.startsWith("참고문헌:");
    });
    if (markerIndex === -1) return text;
    return lines.slice(0, markerIndex).join("\n").trim();
  }
  /**
   * Start a new research session
   */
  async startResearch(chatId, query, model, language = "en") {
    const db2 = getDb();
    const sessionId = v4();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.abortController = new AbortController();
    this.isPaused = false;
    db2.prepare(
      `INSERT INTO research_sessions (id, chat_id, status, query, created_at, updated_at)
       VALUES (?, ?, 'running', ?, ?, ?)`
    ).run(sessionId, chatId, query, now, now);
    this.activeSession = {
      id: sessionId,
      chatId,
      status: "running",
      query,
      plan: null,
      currentStep: 0,
      sources: [],
      reportContent: ""
    };
    this.runResearch(sessionId, chatId, query, model, language).catch((error) => {
      console.error("[Research] Error:", error);
      this.sendUpdate({ event_type: "error", message: error.message });
    });
    return sessionId;
  }
  /**
   * Main research workflow
   */
  async runResearch(sessionId, chatId, query, model, language = "en") {
    const db2 = getDb();
    try {
      const files = db2.prepare("SELECT filename, content FROM uploaded_files WHERE chat_id = ?").all(chatId);
      let enhancedQuery = query;
      if (files.length > 0) {
        const fileContext = files.map((f) => `--- ${f.filename} ---
${f.content.slice(0, 2e3)}`).join("\n\n");
        enhancedQuery = `${query}

Context from uploaded documents:
${fileContext}`;
      }
      this.sendUpdate({ event_type: "status", message: language === "ko" ? "연구 계획 작성 중..." : "Creating research plan..." });
      const plan = await this.createPlan(enhancedQuery, model, language);
      if (!plan) {
        throw new Error("Failed to create research plan");
      }
      db2.prepare("UPDATE research_sessions SET plan = ?, updated_at = ? WHERE id = ?").run(
        JSON.stringify(plan),
        (/* @__PURE__ */ new Date()).toISOString(),
        sessionId
      );
      this.activeSession.plan = plan;
      this.sendUpdate({
        event_type: "plan_created",
        data: {
          toc: plan.sections.map((s) => s.title),
          full_plan: plan
        }
      });
      const sectionResults = [];
      for (let i = 0; i < plan.sections.length; i++) {
        await this.checkPauseCancel();
        const section = plan.sections[i];
        this.activeSession.currentStep = i;
        db2.prepare("UPDATE research_sessions SET current_step = ?, updated_at = ? WHERE id = ?").run(
          i,
          (/* @__PURE__ */ new Date()).toISOString(),
          sessionId
        );
        this.sendUpdate({
          event_type: "research_started",
          data: { section_index: i, topic: section.title }
        });
        const result = await this.researchSection(section, query, model, language);
        sectionResults.push(result);
      }
      await this.checkPauseCancel();
      this.sendUpdate({ event_type: "status", message: language === "ko" ? "보고서 종합 중..." : "Synthesizing report..." });
      await this.synthesizeReport(query, sectionResults, model, language);
      db2.prepare("UPDATE research_sessions SET status = ?, updated_at = ? WHERE id = ?").run(
        "completed",
        (/* @__PURE__ */ new Date()).toISOString(),
        sessionId
      );
      this.sendUpdate({
        event_type: "completed",
        data: { report_preview: this.activeSession.reportContent.slice(0, 500) }
      });
      const reportMessageId = v4();
      db2.prepare(
        `INSERT INTO messages (id, chat_id, role, content, metadata, created_at)
         VALUES (?, ?, 'assistant', ?, ?, ?)`
      ).run(
        reportMessageId,
        chatId,
        this.activeSession.reportContent,
        JSON.stringify({ sources: this.activeSession.sources }),
        (/* @__PURE__ */ new Date()).toISOString()
      );
      await this.generateTitle(chatId, query, model);
    } catch (error) {
      if (error.name === "AbortError" || error.message === "Research cancelled") {
        db2.prepare("UPDATE research_sessions SET status = ?, updated_at = ? WHERE id = ?").run(
          "cancelled",
          (/* @__PURE__ */ new Date()).toISOString(),
          sessionId
        );
        this.sendUpdate({ event_type: "cancelled", message: "Research cancelled by user" });
      } else {
        db2.prepare("UPDATE research_sessions SET status = ?, updated_at = ? WHERE id = ?").run(
          "completed",
          (/* @__PURE__ */ new Date()).toISOString(),
          sessionId
        );
        throw error;
      }
    } finally {
      this.activeSession = null;
      this.abortController = null;
    }
  }
  /**
   * Create research plan using LLM
   */
  async createPlan(query, model, language = "en") {
    const messages = [
      { role: "system", content: PLANNING_PROMPTS[language] },
      { role: "user", content: language === "ko" ? `다음 주제에 대한 연구 계획을 작성하세요: ${query}` : `Create a research plan for: ${query}` }
    ];
    const response = await ollamaService.chat({ model, messages });
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("[Research] Failed to parse plan:", e);
    }
    return null;
  }
  /**
   * Generate search keywords for a section using LLM
   * Returns null if generation fails (for fallback handling)
   */
  async generateSearchKeywords(section, model, language = "en") {
    try {
      const messages = [
        { role: "system", content: KEYWORD_PROMPTS[language] },
        { role: "user", content: language === "ko" ? `섹션 제목: ${section.title}
섹션 설명: ${section.description}

이 주제로 학술 논문을 검색할 키워드를 생성하세요.` : `Section Title: ${section.title}
Section Description: ${section.description}

Generate search keywords for finding academic papers on this topic.` }
      ];
      const response = await ollamaService.chat({ model, messages });
      const keywords = response.content.replace(/\n/g, ", ").replace(/\s+/g, " ").trim();
      console.log(`[Research] Generated keywords for "${section.title}": ${keywords}`);
      return keywords;
    } catch (error) {
      console.error(`[Research] Failed to generate keywords for "${section.title}":`, error);
      return null;
    }
  }
  /**
   * Research a single section
   */
  async researchSection(section, originalQuery, model, language = "en") {
    this.sendUpdate({
      event_type: "tool_start",
      data: { tool: "keyword_generation", section: section.title }
    });
    const keywords = await this.generateSearchKeywords(section, model, language);
    const searchTerms = keywords || `${section.title} ${section.description}`;
    const searchQuery = searchTerms;
    this.sendUpdate({
      event_type: "tool_start",
      data: { tool: "academic_search", query: searchQuery }
    });
    const sources = await this.academicSearch.search(searchQuery);
    for (const source of sources) {
      this.activeSession.sources.push(source);
      this.sendUpdate({
        event_type: "source_found",
        data: {
          title: source.title,
          url: source.url,
          doi: source.doi,
          journal: source.journal
        }
      });
    }
    const content = await this.synthesizeSection(section, sources, model, language);
    return { title: section.title, content, sources };
  }
  /**
   * Synthesize a single section
   */
  async synthesizeSection(section, sources, model, language = "en") {
    const sourcesContext = sources.map(
      (s) => `- ${s.title} (DOI: ${s.doi})
  Authors: ${s.authors.join(", ") || "N/A"}
  Journal: ${s.journal} (${s.year})
  Abstract: ${s.abstract || "N/A"}`
    ).join("\n\n");
    const doiList = sources.map((s) => s.doi).join(", ");
    const userPrompt = language === "ko" ? `학술 연구 보고서의 "${section.title}" 섹션을 작성하세요.

섹션 초점: ${section.description}

사용 가능한 출처 (인라인 인용에 DOI 사용):
${sourcesContext}

허용된 DOI 목록: ${doiList}

CRITICAL INSTRUCTIONS (반드시 지켜야 함):
1. ONLY use DOIs from the list above - 반드시 위 목록에 있는 DOI만 사용하세요
2. Do NOT fabricate or modify DOIs - DOI를 만들어내거나 수정하지 마세요
3. Citation format: (DOI: 10.xxxx/xxxxx) - 인용 형식 준수
4. Every claim must cite its source DOI inline - 모든 주장은 인라인 DOI 인용 필요
5. LANGUAGE: 반드시 한국어로 작성하세요 (Write in Korean only)
6. 모든 본문 내용은 한국어로 작성하되, DOI와 논문 제목은 원문(영어) 그대로 유지하세요` : `Write the "${section.title}" section for an academic research report.

Section Focus: ${section.description}

Available Sources (use DOIs for inline citations):
${sourcesContext}

Allowed DOI list: ${doiList}

CRITICAL INSTRUCTIONS:
1. ONLY use DOIs from the list above
2. Do NOT fabricate or modify DOIs
3. Citation format: (DOI: 10.xxxx/xxxxx)
4. Every claim must cite its source DOI inline`;
    const messages = [
      { role: "system", content: SYNTHESIS_PROMPTS[language] },
      { role: "user", content: userPrompt }
    ];
    const response = await ollamaService.chat({ model, messages });
    return response.content;
  }
  /**
   * Synthesize final report
   */
  async synthesizeReport(query, sectionResults, model, language = "en") {
    let reportContent = "";
    const excludedTitles = [
      "executive summary",
      "요약",
      "summary",
      "references",
      "참고문헌",
      "bibliography"
    ];
    const filteredSections = sectionResults.filter(
      (s) => !excludedTitles.some((t) => s.title.toLowerCase().includes(t))
    );
    const allSources = sectionResults.flatMap((s) => s.sources);
    if (allSources.length === 0) {
      const noSourcesReport = language === "ko" ? `## 보고서 생성 불가

검색 단계에서 DOI가 확인된 문헌을 찾지 못해 보고서를 생성할 수 없습니다. 검색 질의어를 더 구체화하거나 범위를 넓혀 다시 시도하세요.
` : `## Report Unavailable

No DOI-verified sources were found during search, so a report cannot be generated safely. Please refine or broaden the query and try again.
`;
      reportContent = noSourcesReport;
      this.sendUpdate({ event_type: "report_chunk", data: { chunk: noSourcesReport, final: true } });
      this.activeSession.reportContent = reportContent;
      this.activeSession.sources = [];
      return;
    }
    const sourceDoiContext = allSources.map((s) => `${s.doi}: ${s.authors.join(", ")} (${s.year}) - ${s.title}`).join("\n");
    this.sendUpdate({ event_type: "status", message: language === "ko" ? "요약 작성 중..." : "Writing executive summary..." });
    const summaryPrompt = language === "ko" ? `CRITICAL: Write an executive summary (2-3 paragraphs) in KOREAN (한국어로 작성하세요) for a research report on: "${query}"

섹션별 주요 발견:
${filteredSections.map((s) => `## ${s.title}
${s.content.slice(0, 500)}...`).join("\n\n")}

사용 가능한 DOI 목록 (반드시 이 목록의 DOI만 사용):
${sourceDoiContext}

CRITICAL INSTRUCTIONS:
1. LANGUAGE: 반드시 한국어로 작성하세요 (Write in Korean only)
2. Only use DOIs from the list above - 반드시 위 목록에 있는 DOI만 사용하세요
3. Do not fabricate DOIs - DOI를 만들어내지 마세요` : `Write an executive summary (2-3 paragraphs) for a research report on: "${query}"

Key findings from sections:
${filteredSections.map((s) => `## ${s.title}
${s.content.slice(0, 500)}...`).join("\n\n")}

Available DOIs (ONLY use DOIs from this list):
${sourceDoiContext}

IMPORTANT: Only use DOIs from the list above. Do not fabricate DOIs.`;
    const summaryMessages = [
      { role: "system", content: SYNTHESIS_PROMPTS[language] },
      { role: "user", content: summaryPrompt }
    ];
    const summaryResponse = await ollamaService.chat({ model, messages: summaryMessages });
    const summaryTitle = language === "ko" ? "## 요약" : "## Executive Summary";
    const cleanSummary = this.stripInlineReferencesBlock(
      summaryResponse.content.replace(/^##?\s+.+$/gm, "").trim()
    );
    reportContent += `${summaryTitle}

${cleanSummary}

`;
    this.sendUpdate({ event_type: "report_chunk", data: { chunk: reportContent } });
    this.activeSession.reportContent = reportContent;
    for (const section of filteredSections) {
      await this.checkPauseCancel();
      const cleanContent = this.stripInlineReferencesBlock(
        section.content.replace(/^##?\s+.+$/gm, "").trim()
      );
      const sectionContent = `## ${section.title}

${cleanContent}

`;
      reportContent += sectionContent;
      this.sendUpdate({ event_type: "report_chunk", data: { chunk: sectionContent } });
      this.activeSession.reportContent = reportContent;
    }
    this.sendUpdate({
      event_type: "status",
      message: language === "ko" ? "DOI 인용 정합성 확인 중..." : "Validating DOI citations against searched sources..."
    });
    try {
      const fallbackByDoi = /* @__PURE__ */ new Map();
      for (const source of allSources) {
        const sourceDoi = normalizeDoi(source.doi);
        if (!fallbackByDoi.has(sourceDoi)) {
          fallbackByDoi.set(sourceDoi, {
            authors: source.authors,
            year: source.year,
            title: source.title,
            journal: source.journal
          });
        }
      }
      const {
        processedContent,
        citedDois,
        removedDois
      } = filterAndFormatCitationsWithSourceDois(reportContent, fallbackByDoi);
      reportContent = processedContent;
      if (removedDois.length > 0) {
        console.log(`[Research] Removed hallucinated/non-source DOIs: ${removedDois.join(", ")}`);
      }
      const referencesSection = generateReferencesSection(
        citedDois,
        /* @__PURE__ */ new Map(),
        fallbackByDoi,
        language
      );
      reportContent += referencesSection;
      this.sendUpdate({ event_type: "report_replace", data: { content: reportContent } });
      this.sendUpdate({ event_type: "report_chunk", data: { chunk: referencesSection, final: true } });
      this.activeSession.sources = allSources;
    } catch (error) {
      console.error("[Research] Citation validation error:", error);
      const fallbackByDoi = /* @__PURE__ */ new Map();
      for (const source of allSources) {
        const sourceDoi = normalizeDoi(source.doi);
        if (!fallbackByDoi.has(sourceDoi)) {
          fallbackByDoi.set(sourceDoi, {
            authors: source.authors,
            year: source.year,
            title: source.title,
            journal: source.journal
          });
        }
      }
      const { processedContent, citedDois } = filterAndFormatCitationsWithSourceDois(reportContent, fallbackByDoi);
      reportContent = processedContent;
      const referencesContent = generateReferencesSection(citedDois, /* @__PURE__ */ new Map(), fallbackByDoi, language);
      reportContent += referencesContent;
      this.sendUpdate({ event_type: "report_replace", data: { content: reportContent } });
      this.sendUpdate({ event_type: "report_chunk", data: { chunk: referencesContent, final: true } });
    }
    this.activeSession.reportContent = reportContent;
  }
  /**
   * Generate chat title from query
   */
  async generateTitle(chatId, query, model) {
    const messages = [
      {
        role: "user",
        content: `Generate a short (5-7 words) title for a research report about: "${query}"
Reply with ONLY the title, no quotes or extra text.`
      }
    ];
    try {
      const response = await ollamaService.chat({ model, messages });
      const title = response.content.trim().replace(/^["']|["']$/g, "");
      const db2 = getDb();
      db2.prepare("UPDATE chats SET title = ?, updated_at = ? WHERE id = ?").run(
        title,
        (/* @__PURE__ */ new Date()).toISOString(),
        chatId
      );
      this.sendUpdate({ event_type: "status", data: { title_generated: title } });
    } catch (e) {
      console.error("[Research] Failed to generate title:", e);
    }
  }
  /**
   * Check for pause/cancel state
   */
  async checkPauseCancel() {
    if (this.abortController?.signal.aborted) {
      throw new Error("Research cancelled");
    }
    while (this.isPaused) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (this.abortController?.signal.aborted) {
        throw new Error("Research cancelled");
      }
    }
  }
  /**
   * Send update to renderer
   */
  sendUpdate(update) {
    const mainWindow2 = getMainWindow();
    if (mainWindow2 && !mainWindow2.isDestroyed()) {
      mainWindow2.webContents.send("research-update", update);
    }
  }
  /**
   * Pause research
   */
  pause(sessionId) {
    if (this.activeSession?.id === sessionId) {
      this.isPaused = true;
      const db2 = getDb();
      db2.prepare("UPDATE research_sessions SET status = ?, updated_at = ? WHERE id = ?").run(
        "paused",
        (/* @__PURE__ */ new Date()).toISOString(),
        sessionId
      );
      this.sendUpdate({ event_type: "paused", message: "Research paused" });
    }
  }
  /**
   * Resume research
   */
  resume(sessionId) {
    if (this.activeSession?.id === sessionId) {
      this.isPaused = false;
      const db2 = getDb();
      db2.prepare("UPDATE research_sessions SET status = ?, updated_at = ? WHERE id = ?").run(
        "running",
        (/* @__PURE__ */ new Date()).toISOString(),
        sessionId
      );
      this.sendUpdate({ event_type: "status", message: "Research resumed" });
    }
  }
  /**
   * Cancel research
   */
  cancel(sessionId) {
    if (this.activeSession?.id === sessionId) {
      this.abortController?.abort();
    }
  }
  /**
   * Update query mid-research
   */
  async updateQuery(sessionId, newQuery) {
    if (this.activeSession?.id === sessionId) {
      this.cancel(sessionId);
      this.sendUpdate({
        event_type: "status",
        message: "Query updated. Please restart research with the new query.",
        data: { newQuery }
      });
    }
  }
  /**
   * Get current session state
   */
  getActiveSession() {
    return this.activeSession;
  }
}
const researchOrchestrator = new ResearchOrchestrator();
function registerResearchHandlers(ipcMain2) {
  const db2 = getDb();
  ipcMain2.handle(
    "research:start",
    async (_event, payload) => {
      const { chatId, query, model, language = "en" } = payload;
      const messageId = require2("uuid").v4();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      db2.prepare(
        `INSERT INTO messages (id, chat_id, role, content, created_at)
         VALUES (?, ?, 'user', ?, ?)`
      ).run(messageId, chatId, query, now);
      const sessionId = await researchOrchestrator.startResearch(chatId, query, model, language);
      return sessionId;
    }
  );
  ipcMain2.handle("research:pause", (_event, sessionId) => {
    researchOrchestrator.pause(sessionId);
  });
  ipcMain2.handle("research:resume", (_event, sessionId) => {
    researchOrchestrator.resume(sessionId);
  });
  ipcMain2.handle("research:cancel", (_event, sessionId) => {
    researchOrchestrator.cancel(sessionId);
  });
  ipcMain2.handle("research:updateQuery", async (_event, sessionId, newQuery) => {
    await researchOrchestrator.updateQuery(sessionId, newQuery);
  });
  ipcMain2.handle("research:getSession", (_event, sessionId) => {
    const session = db2.prepare(
      `SELECT id, chat_id, status, query, plan, current_step, created_at, updated_at
         FROM research_sessions WHERE id = ?`
    ).get(sessionId);
    if (!session) {
      return null;
    }
    return {
      ...session,
      plan: session.plan ? JSON.parse(session.plan) : null
    };
  });
  ipcMain2.handle("research:getActive", () => {
    return researchOrchestrator.getActiveSession();
  });
  ipcMain2.handle("research:listForChat", (_event, chatId) => {
    const sessions = db2.prepare(
      `SELECT id, status, query, current_step, created_at, updated_at
         FROM research_sessions
         WHERE chat_id = ?
         ORDER BY created_at DESC`
    ).all(chatId);
    return sessions;
  });
  console.log("[IPC] Research handlers registered");
}
class FileParser {
  /**
   * Parse a file and extract text content
   */
  async parse(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case ".pdf":
        return this.parsePDF(filePath);
      case ".md":
      case ".qmd":
        return this.parseMarkdown(filePath);
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }
  }
  /**
   * Parse PDF file and extract text
   */
  async parsePDF(filePath) {
    try {
      const pdfParse = require2("pdf-parse");
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      return {
        content: data.text,
        metadata: {
          pages: data.numpages,
          title: data.info?.Title || void 0,
          author: data.info?.Author || void 0,
          creator: data.info?.Creator || void 0,
          producer: data.info?.Producer || void 0
        }
      };
    } catch (error) {
      if (error.code === "MODULE_NOT_FOUND") {
        throw new Error("PDF parsing not available. Please install pdf-parse: npm install pdf-parse");
      }
      throw error;
    }
  }
  /**
   * Parse Markdown/Quarto file
   */
  async parseMarkdown(filePath) {
    const raw = fs.readFileSync(filePath, "utf-8");
    let metadata = {};
    let content = raw;
    const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const yamlContent = frontmatterMatch[1];
      metadata = this.parseSimpleYaml(yamlContent);
      content = raw.slice(frontmatterMatch[0].length).trim();
    }
    return { content, metadata };
  }
  /**
   * Simple YAML parser for frontmatter
   * Handles basic key: value pairs
   */
  parseSimpleYaml(yaml) {
    const result = {};
    const lines = yaml.split("\n");
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)?$/);
      if (match) {
        const [, key, value] = match;
        if (value) {
          result[key] = value.replace(/^["']|["']$/g, "").trim();
        }
      }
    }
    return result;
  }
}
const fileParser = new FileParser();
function registerFileHandlers(ipcMain2) {
  const db2 = getDb();
  ipcMain2.handle("files:upload", async (_event, chatId) => {
    const result = await dialog.showOpenDialog({
      title: "Select Reference Document",
      filters: [
        { name: "Documents", extensions: ["pdf", "md", "qmd"] },
        { name: "PDF Files", extensions: ["pdf"] },
        { name: "Markdown Files", extensions: ["md", "qmd"] }
      ],
      properties: ["openFile"]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const filePath = result.filePaths[0];
    const filename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase().slice(1);
    try {
      const { content, metadata } = await fileParser.parse(filePath);
      const id = v4();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      db2.prepare(
        `INSERT INTO uploaded_files (id, chat_id, filename, file_type, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, chatId, filename, ext, content, now);
      console.log(`[Files] Uploaded: ${filename} (${content.length} chars)`);
      return {
        id,
        chat_id: chatId,
        filename,
        file_type: ext,
        content_preview: content.slice(0, 500) + (content.length > 500 ? "..." : ""),
        metadata,
        created_at: now
      };
    } catch (error) {
      console.error(`[Files] Upload error:`, error);
      throw new Error(`Failed to parse file: ${error.message}`);
    }
  });
  ipcMain2.handle("files:list", (_event, chatId) => {
    const files = db2.prepare(
      `SELECT id, chat_id, filename, file_type, LENGTH(content) as content_length, created_at
         FROM uploaded_files
         WHERE chat_id = ?
         ORDER BY created_at DESC`
    ).all(chatId);
    return files;
  });
  ipcMain2.handle("files:getContent", (_event, fileId) => {
    const file = db2.prepare("SELECT content FROM uploaded_files WHERE id = ?").get(fileId);
    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }
    return file.content;
  });
  ipcMain2.handle("files:getAllContent", (_event, chatId) => {
    const files = db2.prepare(
      `SELECT filename, content FROM uploaded_files WHERE chat_id = ?`
    ).all(chatId);
    return files.map((f) => ({
      filename: f.filename,
      content: f.content
    }));
  });
  ipcMain2.handle("files:delete", (_event, fileId) => {
    db2.prepare("DELETE FROM uploaded_files WHERE id = ?").run(fileId);
    console.log(`[Files] Deleted: ${fileId}`);
  });
  ipcMain2.handle("dialog:openFile", async (_event, options) => {
    return await dialog.showOpenDialog(options);
  });
  console.log("[IPC] File handlers registered");
}
dotenv.config();
let mainWindow = null;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
      // Required for better-sqlite3
    }
  });
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (/^https?:\/\//i.test(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
function getMainWindow() {
  return mainWindow;
}
app.whenReady().then(async () => {
  console.log("[Main] Neuro Scholar starting...");
  initializeDb();
  console.log("[Main] Database initialized");
  const ollamaReady = ollamaService.initialize();
  console.log("[Main] Ollama service initialized:", ollamaReady ? "ready" : "needs API key");
  registerOllamaHandlers(ipcMain);
  registerChatHandlers(ipcMain);
  registerSettingsHandlers(ipcMain);
  registerResearchHandlers(ipcMain);
  registerFileHandlers(ipcMain);
  console.log("[Main] IPC handlers registered");
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("will-quit", () => {
  closeDb();
  console.log("[Main] Cleanup complete");
});
if (process.env.NODE_ENV === "development") {
  app.on("certificate-error", (event, _webContents, _url, _error, _certificate, callback) => {
    event.preventDefault();
    callback(true);
  });
}
export {
  getMainWindow
};
