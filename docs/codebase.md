# 💻 Codebase Reference

This document breaks down the key source files, their core responsibilities, and the specialized workarounds implemented to ensure stability.

---

## 🐍 Backend Codebase

All backend python files are located inside the `backend/app/` directory.

### ⚙️ [config.py](file:///Users/rajeshhassija/Documents/GitHub/gita/backend/app/config.py)
* **Role**: Configures environment variables and holds active configuration state.
* **Key Logic**: Exposes a mutable `AppSettings` configuration class. This tracks LLM providers, embedding models, API keys, and server settings dynamically on the fly. It also provides helper checks for `is_mock_mode`.

### 💾 [database.py](file:///Users/rajeshhassija/Documents/GitHub/gita/backend/app/database.py)
* **Role**: Interface with ChromaDB. Handles collection operations, semantic document queries, and document insertions.
* **Key Logic**: Exposes `get_chroma_client()`, which dynamically resolves the persistent SQLite directory depending on the active provider setting:
  * Gemini $\rightarrow$ `./chroma_db_backup`
  * Ollama $\rightarrow$ `./chroma_db_ollama`
  * Re-instantiates and caches the persistent connection if the target directory path changed.

### 📑 [ingest.py](file:///Users/rajeshhassija/Documents/GitHub/gita/backend/app/ingest.py)
* **Role**: Scans and parses files in the `books/` directory.
* **Key Logic**:
  * `parse_structured_txt_generator()` / `parse_plain_txt_generator()`: Yields parsed scripture verse chunks and plain paragraph blocks as generators (`yield`) to minimize memory usage.
  * `pdf_stream()`: Streams PDF text page-by-page.
  * `ingest_all_books_generator()`: Incremental directory scan that bundles stream chunks into small batches of 200, embeds them immediately, and flushes memory to prevent out-of-memory errors on massive libraries.

### 🤖 [model.py](file:///Users/rajeshhassija/Documents/GitHub/gita/backend/app/model.py)
* **Role**: Generates vector embeddings and handles streaming chat completions.
* **Key Logic**:
  * `get_embedding()` / `get_embeddings_batch()`: Queries the active provider. If Ollama is active, it calls the local `/api/embed` endpoint prepending task prefixes (`search_query: ` for queries, `search_document: ` for books). Otherwise, it dynamically configures and calls the cloud Gemini AI SDK.
  * `generate_chat_stream()`: Handles chat routing. Streams Ollama completions asynchronously or streams cloud Gemini completions.

### ⚡ [main.py](file:///Users/rajeshhassija/Documents/GitHub/gita/backend/app/main.py)
* **Role**: API routing endpoints using FastAPI.
* **Key Logic**:
  * `verify_admin()`: Dependency middleware that validates the `X-Admin-Password` header on sensitive administrative endpoints.
  * `GET /api/settings` / `POST /api/settings`: Handles retrieving and updating the mutable config settings dynamically on the fly.
  * `POST /api/admin/verify`: Validates administrative passwords.
  * `POST /api/ingest`: Protected ingestion endpoint that triggers book parsing and indexing.

---

## 💻 Frontend Codebase

The frontend files are located inside the `frontend/` directory.

### 🎨 [App.tsx](file:///Users/rajeshhassija/Documents/GitHub/gita/frontend/src/App.tsx)
* **Role**: The main React component rendering the dashboard. Contains conversation history, sidebar library summaries, ingestion states, citation popovers, and streaming API parsers.
* **Workarounds**:
  1. **Fetch Authentication Interceptor**: 
     Intercepts browser `window.fetch` calls. If the target URL contains `loca.lt` (indicating a localtunnel connection), it injects the `Bypass-Tunnel-Reminder: true` HTTP header. Additionally, if an admin password is saved in `localStorage`, it automatically injects the `X-Admin-Password` header for all requests to the backend:
     ```typescript
     const originalFetch = window.fetch;
     window.fetch = async (input, init) => {
       const url = typeof input === "string" ? input : (input instanceof Request ? input.url : "");
       init = init || {};
       const headers = new Headers(init.headers || {});
       if (url.includes("loca.lt")) {
         headers.set("Bypass-Tunnel-Reminder", "true");
       }
       const adminPassword = localStorage.getItem("antarjyoti_admin_password");
       if (adminPassword && (url.includes(API_BASE) || url.startsWith("/api/"))) {
         headers.set("X-Admin-Password", adminPassword);
       }
       if (input instanceof Request) {
         const newRequestInit = { ...init };
         input.headers.forEach((value, key) => {
           if (!headers.has(key)) headers.set(key, value);
         });
         return originalFetch(new Request(input, { headers }), newRequestInit);
       }
       init.headers = headers;
       return originalFetch(input, init);
     };
     ```
  2. **Streaming Parser**:
     Implements real-time JSON decoding of Server-Sent Events (SSE). When it processes `sources` event payload, it populates citation metadata, and for `token` payloads, it appends text to the assistant's speech bubble, rendering raw `[Source #N]` text as interactive gold badges.
