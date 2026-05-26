# 🌐 Cloud Hosting & Operations Guide (Vercel & Fly.io)

This guide documents the startup, shutdown, storage volume mounting, and database backup procedures for the cloud-hosted **AntarJyoti** application.

---

## ☁️ Cloud Services & Hosts

| Tier | Hosted Platform | Production URL | Configured Domain / Address |
| :--- | :--- | :--- | :--- |
| **Frontend** | Vercel CDN | `https://frontend-nu-ecru-51.vercel.app` | Static single-page React app bundle |
| **Backend API** | Fly.io VM | `https://antarjyoti-backend.fly.dev` | FastAPI / Uvicorn server running on Port 8000 |
| **Vector DB** | Fly.io Volume | Mounted at `/data` inside VM | ChromaDB SQLite index files (Gemini embeddings) |

---

## 💾 1. Local Database Backups

Because ChromaDB stores embeddings as local SQLite and binary files, your databases are fully portable.

### Local Backup Paths on your Mac
* **Google Gemini Database Backup** (3072 dimensions): [backend/chroma_db_backup](file:///Users/rajeshhassija/Documents/GitHub/gita/backend/chroma_db_backup) (587 MB)
* **Local Ollama Database Backup** (768 dimensions): [backend/chroma_db_ollama](file:///Users/rajeshhassija/Documents/GitHub/gita/backend/chroma_db_ollama) (625 MB)

### 📥 Backing Up / Pulling Database Changes from Cloud to Mac
If you perform new document ingestions in the cloud and want to download the updated database files (vector databases and embeddings) back to your laptop:
1. Open a terminal and navigate to the project backend directory:
   ```bash
   cd backend
   ```
2. Clean up any previous download folders (recursively) to avoid conflicting folders:
   * **macOS / Linux**:
     ```bash
     rm -rf ./chroma_db_backup_new
     ```
   * **Windows (PowerShell)**:
     ```powershell
     Remove-Item -Recurse -Force ./chroma_db_backup_new
     ```
3. Pull the files recursively from the Fly.io persistent volume using SFTP:
   ```bash
   fly sftp get -a antarjyoti-backend -R /data/chroma_db_backup ./chroma_db_backup_new
   ```

### 📊 Pulling & Reviewing User Feedback Telemetry Logs
If you want to download and review user thumbs up/down ratings, questions, answers, references, and response latencies logged in production:
1. Navigate to the project root directory.
2. Delete any existing local copy of `chroma_prod.sqlite3` (since the Fly.io SFTP client prevents overwriting files for safety):
   * **macOS / Linux**:
     ```bash
     rm -f chroma_prod.sqlite3
     ```
   * **Windows (PowerShell)**:
     ```powershell
     Remove-Item -Force chroma_prod.sqlite3
     ```
3. Run the one-liner command to download the live database directly to the root of your local repository:
   ```bash
   # Combined Delete & Download One-Liner (macOS / Linux)
   rm -f chroma_prod.sqlite3 && fly sftp get -a antarjyoti-backend /data/chroma_db_backup/chroma.sqlite3 ./chroma_prod.sqlite3
   ```
4. Once downloaded, review the logs using one of the following local tools:
   * **Jupyter Notebook**: Open [query_feedback.ipynb](file:///Users/rajeshhassija/Documents/GitHub/gita/query_feedback.ipynb) in VS Code or Jupyter Server. Re-run all cells. It dynamically detects `chroma_prod.sqlite3`, sets up the tables if necessary, and renders beautiful tables with aggregated statistics (e.g. helpfulness count, response times).
   * **Terminal/Console CLI Command**: Run the standalone logger utility script from the repository root:
     ```bash
     python view_logs.py
     ```

### 📤 Restoring / Pushing Database Files from Mac to Cloud
To restore or upload a pre-built local database folder from your laptop to the cloud volume:
```bash
cd backend
# Upload the local chroma_db_backup folder into Fly's persistent storage
fly sftp put -R chroma_db_backup /data/chroma_db_backup
# Restart the machine to load the new database files
fly machine restart <machine-id>
```

---

## ⚙️ 2. Fly.io VM Server Operations

Fly.io hosts the backend server inside a Firecracker VM in the `iad` region.

### 🟢 Start the Backend Server
Fly.io is configured to automatically wake up and start your machine when an HTTP request arrives (`auto_start_machines = true` in `fly.toml`). However, if you need to force start it:
```bash
# Get the active machine ID
fly machines list
# Start the machine
fly machine start <machine-id>
```

### 🔴 Shut Down / Stop the Backend Server
To save compute time or turn off the server completely:
```bash
# Force stop the running machine
fly machine stop <machine-id>
```
*Note: Because `auto_stop_machines = 'stop'` is enabled in `fly.toml`, Fly.io will automatically suspend the machine after a few minutes of inactivity to save resources.*

### 🔄 Restart the Server
If you want to clear uvicorn's cache or reload database connections:
```bash
fly machine restart <machine-id>
```

### 📁 Storage Volume Mounting
The persistent disk `chroma_data` is mounted to the VM at the `/data` directory.
* **Volume Size**: `1 GB` (allocated to fit the ~580MB Gemini database with room for expansion).
* **Configuration**: Managed in `backend/fly.toml`:
  ```toml
  [[mounts]]
    source = "chroma_data"
    destination = "/data"
  ```
* **Environment Variable**: `CHROMA_DB_DIR` is set to `/data` in Fly.io to direct uvicorn to read SQLite files from the persistent volume.

### 🔍 Inspecting Logs
To view uvicorn startup logs or monitor live traffic:
* **Show recent logs**: `fly logs --no-tail`
* **Stream live logs**: `fly logs`

### 🔒 Secure Secrets & Passwords
Sensitive credentials (such as Google API keys and admin passwords) are stored as cloud secrets rather than hardcoded `.env` files:
```bash
fly secrets set GEMINI_API_KEY="your-gemini-key" ADMIN_PASSWORD="your-secure-admin-password"
```

---

## ⚡ 3. Vercel Frontend Operations

Vercel hosts the React client interface statically and serves it via a global CDN.

### 🔄 Redeploying the Frontend
If you modify frontend files locally and want to push updates to production:
```bash
cd frontend
# Deploy directly to Vercel production
npx vercel --prod --yes
```

### 🔗 Updating the API Endpoint URL
If the backend hostname changes, update Vercel's environment variables:
1. Override the variable:
   ```bash
   npx vercel env add VITE_API_BASE_URL production --value https://your-new-backend.fly.dev --yes
   ```
2. Redeploy to compile the updated variables into the JS bundle:
   ```bash
   npx vercel --prod --yes
   ```
