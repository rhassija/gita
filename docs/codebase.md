# 💻 Codebase Reference

This document breaks down the key source files, their core responsibilities, and the specialized workarounds implemented to ensure stability.

---

## 🐍 Backend Codebase

All backend python files are located inside the `backend/app/` directory.

### ⚙️ [config.py](file:///Users/rajeshhassija/Documents/GitHub/gita/backend/app/config.py)
* **Role**: Loads environment variables from the `.env` file using `dotenv` (with `override=True` to guarantee local file precedence).
* **Key Logic**: Resolves `LLM_PROVIDER` (either `"gemini"` or `"ollama"`), model specifications, database paths, and configures `IS_MOCK_MODE`. It logs the active provider and any critical warning messages to standard output upon application startup.

### 💾 [database.py](file:///Users/rajeshhassija/Documents/GitHub/gita/backend/app/database.py)
* **Role**: Interface with ChromaDB. Handles collection creation, semantic document queries, and document insertions.
* **Workaround**: Solves the SQLite batch insertion limit by splitting records into batches of `250` in the `add_documents` method, preventing database write crashes.

### 📑 [ingest.py](file:///Users/rajeshhassija/Documents/GitHub/gita/backend/app/ingest.py)
* **Role**: Scans and parses files in the `books/` directory.
* **Key Logic**:
  * `parse_structured_txt()`: Regex-based tag parser for scripture chapter/verse splits.
  * `parse_plain_txt()`: Splits plain text by paragraphs (`\n\n`).
  * `parse_pdf()`: Extracts text page-by-page using the `pypdf` library.
  * `ingest_all_books_generator()`: A Python generator that reads directories, performs incremental skips for already loaded books, processes files in batches, and yields Server-Sent Events (SSE) progress JSON payloads.

### 🤖 [model.py](file:///Users/rajeshhassija/Documents/GitHub/gita/backend/app/model.py)
* **Role**: Generates vector embeddings and handles streaming chat completions.
* **Key Logic**:
  * `get_embedding()` / `get_embeddings_batch()`: Uses Google Gemini AI embeddings API, falling back deterministically to MD5-based mock vectors if no API keys are present.
  * `generate_chat_stream()`: Handles chat routing. If `LLM_PROVIDER == "ollama"`, it sends a streaming POST request to the local Ollama `/api/generate` endpoint and decodes the incoming JSON lines using `requests.iter_lines()`. Otherwise, it calls the cloud Gemini model or executes the Mock generator.

### ⚡ [main.py](file:///Users/rajeshhassija/Documents/GitHub/gita/backend/app/main.py)
* **Role**: API routing endpoints using FastAPI.
* **Key Logic**:
  * `GET /api/books`: Summarizes loaded library collections and counts database chunks.
  * `POST /api/ingest`: Triggers the document ingestion generator and streams live progress events.
  * `POST /api/chat`: Runs database semantic retrieval, formats prompts, and yields the SSE stream. The first data event contains the `sources` array, followed by `token` events and a final `done` event.

---

## 💻 Frontend Codebase

The frontend files are located inside the `frontend/` directory.

### 🎨 [App.tsx](file:///Users/rajeshhassija/Documents/GitHub/gita/frontend/src/App.tsx)
* **Role**: The main React component rendering the dashboard. Contains conversation history, sidebar library summaries, ingestion states, citation popovers, and streaming API parsers.
* **Workarounds**:
  1. **Global Fetch Interceptor**: 
     Intercepts browser `window.fetch` calls. If the target URL contains `loca.lt` (indicating a localtunnel connection), it injects the `Bypass-Tunnel-Reminder: true` HTTP header, preventing localtunnel's security screen from interrupting API queries:
     ```typescript
     const originalFetch = window.fetch;
     window.fetch = async (input, init) => {
       const url = typeof input === "string" ? input : (input instanceof Request ? input.url : "");
       if (url.includes("loca.lt")) {
         init = init || {};
         const headers = new Headers(init.headers || {});
         headers.set("Bypass-Tunnel-Reminder", "true");
         if (input instanceof Request) {
           return originalFetch(new Request(input, { headers }), init);
         }
         init.headers = headers;
       }
       return originalFetch(input, init);
     };
     ```
  2. **Streaming Parser**:
     Implements real-time JSON decoding of Server-Sent Events (SSE). When it processes `sources` event payload, it populates citation metadata, and for `token` payloads, it appends text to the assistant's speech bubble, rendering raw `[Source #N]` text as interactive gold badges.
