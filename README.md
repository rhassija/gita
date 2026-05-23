# AntarJyoti - Spiritual Books Chatbot 🧘✨

AntarJyoti (meaning "Inner Light") is a premium, responsive Retrieval-Augmented Generation (RAG) chatbot designed to answer questions based on a library of spiritual books and scriptures (such as the Bhagavad Gita) while providing direct, inline citations to source chapters, verses, or page numbers.

The application can run in three modes:
1. **Fully Local Mode**: Uses Ollama (e.g. `gemma3:4b`) on your local machine for chat generation and mock embeddings for vectors.
2. **Hybrid Cloud Mode**: Uses Google Gemini API for both chat reasoning and high-fidelity vector embeddings.
3. **Mock Mode**: Fully offline, generating mock responses and embeddings for development and testing.

---

## 📂 Project Structure

```text
gita/
├── backend/                  # FastAPI Backend API
│   ├── app/                  # Application source code
│   │   ├── config.py         # Settings & Environment variables loader
│   │   ├── database.py       # ChromaDB vector store configuration
│   │   ├── ingest.py         # Book parsing and indexing pipeline
│   │   ├── main.py           # FastAPI server and SSE endpoints
│   │   └── model.py          # Gemini & Ollama completion wrappers
│   ├── requirements.txt      # Python dependencies
│   └── run_ingest.sh         # CLI ingestion wrapper script
├── books/                    # Local storage for source books (PDF, TXT)
├── docs/                     # Documentation & Guides
│   ├── architecture.md       # Architectural overview & RAG details
│   ├── codebase.md           # Breakdown of key codebase files & logic
│   └── quickstart.md         # Quick start guides for local run & ingestion
├── frontend/                 # Vite + React Frontend Dashboard
│   ├── src/                  # React source files (components, styles)
│   └── package.json          # Node dependencies
└── README.md                 # Root readme index
```

---

## 📖 Documentation Index

To help you run, customize, and deploy this project, we have created dedicated guides in the `docs/` folder:

* 🛠️ **[Quick Start Guide](docs/quickstart.md)**: Steps to spin up the frontend, backend, execute the data ingestion scripts, and tunnel for public access.
* 🏗️ **[Architecture Design](docs/architecture.md)**: In-depth structural diagrams, RAG query flow, and local vs. cloud configuration.
* 💻 **[Codebase Reference](docs/codebase.md)**: Deep dive into the codebase logic, including parsing strategies, custom fetch wrappers, and SSE streams.
