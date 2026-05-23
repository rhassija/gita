# AntarJyoti - Spiritual Books Chatbot 🧘✨

AntarJyoti (meaning "Inner Light") is a premium, responsive Retrieval-Augmented Generation (RAG) chatbot designed to answer questions based on a library of spiritual books and scriptures (such as the Bhagavad Gita) while providing direct, inline citations to source chapters, verses, or page numbers.

The application can run in three modes:
1. **Fully Local Mode**: Run completely offline! Uses local Ollama LLMs (e.g. `gemma3:4b`) for chat generation and local vector embeddings (e.g. `nomic-embed-text`) stored in a dynamically mounted `./chroma_db_ollama` directory.
2. **Hybrid/Cloud Mode**: Uses Google Gemini API for chat reasoning and high-fidelity vector embeddings stored in `./chroma_db_backup`.
3. **Mock Mode**: Fully offline, generating mock responses and embeddings for development and testing.

---

## 📂 Project Structure

```text
gita/
├── backend/                  # FastAPI Backend API
│   ├── app/                  # Application source code
│   │   ├── config.py         # AppSettings mutable configuration state
│   │   ├── database.py       # Dynamic ChromaDB client switching (Google vs. Ollama paths)
│   │   ├── ingest.py         # Memory-efficient streaming book ingestion pipeline
│   │   ├── main.py           # FastAPI server and SSE/Settings endpoints
│   │   └── model.py          # Gemini & Ollama dynamic wrapper integration
│   ├── requirements.txt      # Python dependencies
│   └── run_ingest.sh         # CLI ingestion wrapper script
├── books/                    # Local storage for source books (PDF, TXT)
├── docs/                     # Documentation & Guides
│   ├── architecture.md       # Architectural overview & dynamic routing diagrams
│   ├── codebase.md           # Breakdown of codebase files & dynamic fetch wrappers
│   └── quickstart.md         # Quick start guides for local run & dynamic re-indexing
├── frontend/                 # Vite + React Frontend Dashboard
│   ├── src/                  # React source files (components, styles)
│   └── package.json          # Node dependencies
└── README.md                 # Root readme index
```

---

## 📖 Documentation Index

To help you run, customize, and deploy this project, we have created dedicated guides in the `docs/` folder:

* 🛠️ **[Quick Start Guide](docs/quickstart.md)**: Steps to spin up the frontend and backend, log in to the Admin Console, and execute dynamic database re-indexing.
* 🏗️ **[Architecture Design](docs/architecture.md)**: In-depth dynamic sequence diagrams, streaming ingestion flow, and dynamic vector database routing details.
* 💻 **[Codebase Reference](docs/codebase.md)**: Deep dive into the codebase logic, including the global fetch wrapper with auto-auth headers, dynamic config states, and SSE streams.
