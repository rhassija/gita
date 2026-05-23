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
   * **Value**: `https://antarjyoti-backend.fly.dev` (your live Fly.io backend URL)
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
   npx vercel env add VITE_API_BASE_URL production --value https://antarjyoti-backend.fly.dev --yes
   ```
4. Redeploy to push the variables into the build:
   ```bash
   npx vercel --prod --yes
   ```

---

## ☁️ 5. Cloud Backend Hosting (Fly.io)

For a fully hosted experience where your laptop does not need to run a server or tunnel, you can host the FastAPI backend and Chroma database on **Fly.io** using a persistent storage volume.

### Step 1: Install Flyctl and Log In
1. Install the Fly.io command-line tool on your local Mac:
   ```bash
   brew install flyctl
   ```
2. Log in to your Fly.io account (opens a browser window):
   ```bash
   fly auth login
   ```

### Step 2: Create a Persistent Disk Volume
Fly.io runs applications inside stateless firecracker VMs. To keep your database index files from being wiped when the VM restarts or redeploys, you must provision a persistent storage volume:
```bash
cd backend
fly volumes create chroma_data --size 1 --region iad
```

### Step 3: Configure Environment & Deploy
The `backend/fly.toml` file mounts this volume to `/data` and routes uvicorn. Deploy the backend with:
```bash
fly deploy
```

### Step 4: Set API Key Secrets
Set your Google Gemini API key and admin password securely on the Fly.io dashboard:
```bash
fly secrets set GEMINI_API_KEY="your-gemini-api-key-here" ADMIN_PASSWORD="your-secure-admin-password"
```

### Step 5: Upload Your Local Database Index (Crucial)
To avoid having to rebuild your database and pay for Gemini embeddings APIs again, copy your pre-built index directory directly to the persistent volume using Fly's secure SFTP:
```bash
# Upload the local chroma_db_backup directory to Fly.io persistent volume
fly sftp put -R chroma_db_backup /data/chroma_db_backup
```
Once the upload finishes (around 2-3 minutes for ~580MB), restart the Fly.io machine to load the new database files:
```bash
# Find the machine ID using: fly machines list
fly machine restart <machine-id>
```

---

## 🔒 6. Public Admin Panel & Security Confirmation

When your app is deployed to the public Vercel frontend link (e.g. `https://frontend-nu-ecru-51.vercel.app`):
1. **Public Visibility**: The **Admin Panel** tab will show up on the public link.
2. **Access Control**: General users can only chat with the bot and view citation sources. They cannot see the administration controls or configuration sliders.
3. **Authentication**: To unlock settings or indexing controls, you must click **🔒 Admin Panel Login** at the bottom left of the sidebar and enter your configured password.
4. **Backend Security**: Any sensitive modifications (`POST /api/settings` and `POST /api/ingest`) verify the `X-Admin-Password` header on the Fly.io server, preventing unauthorized manipulation even if someone bypasses the UI controls.

---

## 🔗 Appendix: Local Development Tunneling (Alternative)

If you are developing locally and want to temporarily share your local backend from your laptop to Vercel without hosting it on Fly.io, you can use LocalTunnel:
1. Open a new terminal and launch the tunnel:
   ```bash
   npx localtunnel --port 8000 --subdomain fine-ravens-study
   ```
2. Copy your tunnel URL (e.g. `https://fine-ravens-study.loca.lt`).
3. Set this URL as the value of `VITE_API_BASE_URL` on Vercel and redeploy.
