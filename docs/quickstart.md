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

### Production Build & Deploy to Vercel

To host your React application publicly, you can deploy it to **Vercel** for free.

#### Method A: Deploy via GitHub (Recommended)
1. Push your code to your GitHub repository.
2. Sign up or log into [Vercel](https://vercel.com).
3. Click **Add New > Project** and import your repository.
4. **Crucial Setting**: Under the project configuration screen, change the **Root Directory** to `frontend`. (This tells Vercel to build the React codebase instead of the empty root).
5. Expand **Environment Variables** and add:
   * **Key**: `VITE_API_BASE_URL`
   * **Value**: `https://your-tunnel-subdomain.loca.lt` (or your cloud backend URL)
6. Click **Deploy**. Vercel will build the Vite bundle and output a permanent production URL.

#### Method B: Deploy via Vercel CLI
If you want to deploy directly from your local terminal:
1. Navigate to the `frontend/` folder:
   ```bash
   cd frontend
   ```
2. Run the deployment setup:
   ```bash
   npx vercel --yes
   ```
3. Add the environment variable for production:
   ```bash
   npx vercel env add VITE_API_BASE_URL production --value https://your-tunnel-subdomain.loca.lt --yes
   ```
4. Redeploy to push the variables into the build:
   ```bash
   npx vercel --prod --yes
   ```

---

## 🔗 4. Exposing Backend Publicly (Tunneling)

To connect your frontend on Vercel to the backend running locally on your Mac Mini, you need to expose port `8000` to the internet.

### Option A: LocalTunnel (No Signup Required)
1. Open a new terminal on your Mac and launch the tunnel:
   ```bash
   npx localtunnel --port 8000 --subdomain fine-ravens-study
   ```
   > [!TIP]
   > Always specify a custom `--subdomain` parameter (e.g. `--subdomain my-scripture-chat`). This guarantees you get the **exact same URL** every time you start the tunnel, so you don't have to keep updating your Vercel environment variables!

2. Copy your tunnel URL (e.g., `https://fine-ravens-study.loca.lt`).
3. Set this URL as the value of `VITE_API_BASE_URL` in Vercel.

### Option B: Cloudflare Tunnel (Quick Tunnels)
If you have Cloudflare's CLI installed, you can launch a free quick tunnel:
```bash
cloudflared tunnel --url http://localhost:8000
```
This generates a random `*.trycloudflare.com` URL without requiring any registration or accounts.

### Option C: Ngrok (Standard)
1. Install ngrok via Homebrew:
   ```bash
   brew install ngrok/ngrok/ngrok
   ```
2. Link your account authtoken (from ngrok.com dashboard):
   ```bash
   ngrok config add-authtoken <your-token>
   ```
3. Run the tunnel:
   ```bash
   ngrok http 8000
   ```

