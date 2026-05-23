# ⚡ Quick Start Guide

Follow these steps to run the AntarJyoti application locally, load your books, and expose the server to the web.

---

## 🐍 1. Backend Setup & Run

The backend is built with Python and FastAPI.

### Prerequisites
Make sure Python 3.10+ is installed on your machine.

### Installation
1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate
   ```
3. Install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Copy the environment variables:
   Create a `.env` file in the `backend/` directory based on the following template:
   ```env
   # LLM Provider: 'gemini' or 'ollama'
   LLM_PROVIDER=ollama

   # Gemini API Key (Optional if LLM_PROVIDER=ollama, required for 'gemini' and Gemini embeddings)
   GEMINI_API_KEY=AIzaSy...

   # Local database storage path
   CHROMA_DB_PATH=./chroma_db

   # Ollama settings
   OLLAMA_HOST=http://localhost:11434
   OLLAMA_MODEL=gemma3:4b

   # Server host and port
   HOST=0.0.0.0
   PORT=8000
   ```

### Run Server
Start the development API server:
```bash
python -m app.main
```
The server will start on [http://localhost:8000](http://localhost:8000). The API health check can be verified at [http://localhost:8000/api/health](http://localhost:8000/api/health).

---

## 📚 2. Running Data Ingestion

The ingestion pipeline scans the `books/` directory for `.txt` and `.pdf` files, parses them, embeds them, and inserts them into ChromaDB.

* **Trigger via UI**: You can click the **"Index / Reload Books"** button on the live website sidebar. This streams real-time load progress to a golden progress bar.
* **Trigger via CLI**: Run the helper script in the `backend/` folder:

### Ingest New Books (Incremental)
Only files that have not been processed before will be added. This skips already loaded books to save API costs and time:
```bash
./run_ingest.sh
```

### Wipe Database and Re-Ingest All (Clear)
Wipes the entire ChromaDB collection and parses all files in `books/` from scratch:
```bash
./run_ingest.sh --clear
```

---

## 💻 3. Frontend Setup & Run

The frontend is a React single-page app built with Vite, TypeScript, and CSS.

### Installation
1. Navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```
2. Install npm packages:
   ```bash
   npm install
   ```

### Run Dev Server
Start the Vite development server:
```bash
npm run dev
```
The app will run locally at [http://localhost:5173](http://localhost:5173).

### Production Build
To build the static files for production deployment (e.g. Vercel):
```bash
npm run build
```
This generates the optimized bundle inside the `dist/` directory.

---

## 🔗 4. Exposing Backend Publicly (Tunneling)

To make your local backend accessible to a public website (like Vercel) for free:

1. In a new terminal window on your Mac, launch a secure tunnel:
   ```bash
   npx localtunnel --port 8000
   ```
2. Copy the generated URL (e.g., `https://fine-ravens-study.loca.lt`).
3. Add this URL as the environment variable `VITE_API_BASE_URL` in your Vercel project settings.
4. Redeploy the frontend on Vercel so the production build hooks into this URL.
