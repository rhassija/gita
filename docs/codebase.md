# 💻 Codebase Reference

This document breaks down the key source files, their core responsibilities, and the specialized workarounds implemented to ensure stability.

---

## 🐍 Backend Codebase

All backend python files are located inside the `backend/app/` directory.

### ⚙️ [config.py](file:///Users/rajeshhassija/Documents/GitHub/gita/backend/app/config.py)
* **Role**: Configures environment variables and holds active configuration state.
* **Key Logic**: Exposes a mutable `AppSettings` configuration class. This tracks LLM providers, embedding models, API keys, and server settings dynamically on the fly. It also provides helper checks for `is_mock_mode`.

### 💾 [database.py](file:///Users/rajeshhassija/Documents/GitHub/gita/backend/app/database.py)
* **Role**: Interface with ChromaDB and telemetry SQLite operations. Handles collection operations, semantic document queries, document insertions, and feedback telemetry logging.
* **Key Logic**:
  * Exposes `get_chroma_client()`, which dynamically resolves the persistent SQLite directory depending on the active provider setting:
    * Gemini $\rightarrow$ `./chroma_db_backup`
    * Ollama $\rightarrow$ `./chroma_db_ollama`
    * Re-instantiates and caches the persistent connection if the target directory path changed.
  * `init_feedback_db(sqlite_path)`: Creates the SQLite table `user_feedback` inside the active Chroma database file if it does not already exist. The table stores question-answer context, citation source strings, feedback rating values (`1` for 👍, `-1` for 👎), and generation latency.
  * `save_feedback(...)`: Safely connects to the active database and inserts a user telemetry record.

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
  * `POST /api/feedback`: Public endpoint to submit user feedback, logging question, answer, sources, thumbs value, and response latency to the SQLite database.
  * `GET /api/admin/feedback`: Admin-protected endpoint that retrieves the entire user feedback log sorted chronologically.

---

## 💻 Frontend Codebase

The frontend files are located inside the `frontend/` directory.

### 🎨 [App.tsx](file:///Users/rajeshhassija/Documents/GitHub/gita/frontend/src/App.tsx)
* **Role**: The main React component rendering the dashboard. Contains conversation history, sidebar library summaries, settings selectors, citation overlays, and user feedback logs.
* **Key Telemetry & Chat Logic**:
  1. **Fetch Authentication Interceptor**: 
     Intercepts browser `window.fetch` calls. If the target URL contains `loca.lt` (indicating a localtunnel connection), it injects the `Bypass-Tunnel-Reminder: true` HTTP header. Additionally, if an admin password is saved in `localStorage`, it automatically injects the `X-Admin-Password` header for all requests to the backend.
  2. **Latency Tracking & Feedback buttons**:
     Measures generation time in milliseconds by tracking when the streaming request starts versus when the server sends the final done SSE token. Submits ratings via thumbs up (`1`) and thumbs down (`-1`) buttons attached directly to each assistant response.
  3. **Admin Telemetry Logs Panel**:
     An administration modal accessible only when authenticated. It fetches logs from `/api/admin/feedback` and renders them in an interactive table showing timestamp, user query, latency, thumbs status, and full assistant replies with a search filter and JSON download exporter.
  4. **Streaming Parser**:
     Implements real-time JSON decoding of Server-Sent Events (SSE). When it processes `sources` event payload, it populates citation metadata, and for `token` payloads, it appends text to the assistant's speech bubble, rendering raw `[Source #N]` text as interactive gold badges.

---

## 🛠️ Local Database Query Utilities

Located at the repository root folder, these utilities allow developers to query and audit the data locally without logging into the hosted site.

### 📊 [query_feedback.ipynb](file:///Users/rajeshhassija/Documents/GitHub/gita/query_feedback.ipynb)
* **Role**: Interactive Jupyter notebook to review, filter, and aggregate feedback logs.
* **Logic**: Automatically scans folders upward to find the project root folder. Looks for `chroma_prod.sqlite3` (production database copy) or falls back to local database backups (`backend/chroma_db_backup/chroma.sqlite3`). Verifies that the telemetry table exists and loads it into a Pandas DataFrame, running aggregate queries (e.g. total ratings, average latency, helper counts).

### 🖥️ [view_logs.py](file:///Users/rajeshhassija/Documents/GitHub/gita/view_logs.py)
* **Role**: Light terminal script to print logged feedback entries as a text table.
* **Logic**: Resolves paths to local database instances, queries SQLite, and prints a cleanly formatted console table of recent ratings.
