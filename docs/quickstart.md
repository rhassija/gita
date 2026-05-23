# ⚡ Quick Start Guide

Follow these steps to run the AntarJyoti application locally, load your books, switch between LLM/embedding configurations dynamically, and expose the server to the web.

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
   Create a `.env` file in the `backend/` directory based on the following configuration:
   ```env
   # LLM Provider Selection: 'gemini' or 'ollama'
   LLM_PROVIDER=ollama

   # Embedding Provider Selection: 'gemini' or 'ollama'
   EMBEDDING_PROVIDER=ollama

   # Gemini API Key (Optional if using Ollama, required for 'gemini' models)
   GEMINI_API_KEY=AIzaSy...

   # Ollama settings (Used if LLM_PROVIDER=ollama or EMBEDDING_PROVIDER=ollama)
   OLLAMA_HOST=http://localhost:11434
   OLLAMA_MODEL=gemma3:4b
   OLLAMA_EMBEDDING_MODEL=nomic-embed-text

   # Security Configuration (Locks configuration and ingestion APIs)
   ADMIN_PASSWORD=admin123

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

## 🔒 2. Logging into the Admin Panel

Ingestion controls and configuration selectors are secured from general users behind a password lock.

1. Open the frontend dashboard at **[http://localhost:5173](http://localhost:5173)**.
2. In the bottom left of the sidebar, click the **🔒 Admin Panel Login** button. (If you are on mobile, click **Library** in the header first to open the sidebar).
3. Enter your configured password (default is `admin123`) and click **Submit**.
4. The sidebar will immediately slide up the **⚙️ Admin Settings** and **⚙️ Ingestion Controls** panels.
5. Your login session is cached in local storage so you do not need to log in again. You can click **Logout** next to "Admin Settings" to sign out.

---

## 📚 3. Running Data Ingestion

The ingestion pipeline scans the `books/` directory for `.txt` and `.pdf` files, parses them, embeds them, and inserts them into ChromaDB. 

The pipeline runs in a **memory-efficient streaming mode**: it parses documents page-by-page, generates vector embeddings in batches of 200, and writes them to disk immediately to prevent out-of-memory errors on large libraries.

### Method A: Trigger via Web UI (Recommended)
1. Make sure you are logged in to the **Admin Panel**.
2. To overwrite previous indices (e.g. if vector dimensions changed due to switching embedding models), check the **"Clear database before indexing"** checkbox.
3. Click the **Index / Reload Books** button.
4. You can monitor the progress bar and active book status loading in real-time.

### Method B: Trigger via CLI
Run the helper script in the `backend/` folder:

* **Ingest New Books (Incremental)**:
  Only files that have not been processed before will be added. This skips already loaded books to save costs and time:
  ```bash
  ./run_ingest.sh
  ```
* **Wipe Database and Re-Ingest All (Clear)**:
  Wipes the entire ChromaDB collection and parses all files in `books/` from scratch:
  ```bash
  ./run_ingest.sh --clear
  ```

---

## 💻 4. Frontend Setup & Run

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
4. Under the project configuration screen, change the **Root Directory** to `frontend`.
5. Expand **Environment Variables** and add:
   * **Key**: `VITE_API_BASE_URL`
   * **Value**: `https://your-tunnel-subdomain.loca.lt` (or your cloud backend URL)
6. Click **Deploy**. Vercel will build the Vite bundle and output a permanent production URL.

#### Method B: Deploy via Vercel CLI
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

## 🔗 5. Exposing Backend Publicly (Tunneling)

To connect your frontend on Vercel to the backend running locally on your Mac, you need to expose port `8000` to the internet.

### Option A: LocalTunnel (No Signup Required)
1. Open a new terminal and launch the tunnel:
   ```bash
   npx localtunnel --port 8000 --subdomain fine-ravens-study
   ```
   > [!TIP]
   > Always specify a custom `--subdomain` parameter. This guarantees you get the **exact same URL** every time you start the tunnel, so you don't have to keep updating your Vercel environment variables!

2. Copy your tunnel URL (e.g., `https://fine-ravens-study.loca.lt`).
3. Set this URL as the value of `VITE_API_BASE_URL` in Vercel.

### Option B: Cloudflare Tunnel (Quick Tunnels)
Launch a free quick tunnel:
```bash
cloudflared tunnel --url http://localhost:8000
```
This generates a random `*.trycloudflare.com` URL without requiring any registration or accounts.
