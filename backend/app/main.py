import json
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Optional

from app.config import HOST, PORT, settings, print_current_config
from app.database import query_documents, get_collection, clear_database, save_feedback
from app.model import generate_chat_stream
from app.ingest import ingest_all_books, ingest_all_books_generator

app = FastAPI(title="AntarJyoti - Spiritual Books Chatbot API")

# Configure CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    # Optionally restrict search to a specific book
    filter_book: Optional[str] = None

class SettingsRequest(BaseModel):
    llm_provider: Optional[str] = None
    embedding_provider: Optional[str] = None
    llm_model: Optional[str] = None
    embedding_model: Optional[str] = None
    ollama_host: Optional[str] = None
    ollama_model: Optional[str] = None
    ollama_embedding_model: Optional[str] = None
    gemini_api_key: Optional[str] = None

class VerifyRequest(BaseModel):
    password: str

class FeedbackRequest(BaseModel):
    question: str
    answer: str
    sources: Optional[List[Dict]] = []
    feedback_value: int
    latency_ms: Optional[float] = 0.0

# Dependency helper to verify admin credentials
def verify_admin(x_admin_password: Optional[str] = Header(None)):
    if x_admin_password != settings.admin_password:
        raise HTTPException(status_code=403, detail="Unauthorized: Invalid admin password.")

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}

@app.get("/api/settings")
def get_settings():
    """
    Retrieves current active configurations (masks API key for security).
    """
    api_key_masked = ""
    if settings.gemini_api_key:
        api_key_masked = settings.gemini_api_key[:6] + "..." if len(settings.gemini_api_key) > 6 else "***"
    return {
        "llm_provider": settings.llm_provider,
        "embedding_provider": settings.embedding_provider,
        "llm_model": settings.llm_model,
        "embedding_model": settings.embedding_model,
        "ollama_host": settings.ollama_host,
        "ollama_model": settings.ollama_model,
        "ollama_embedding_model": settings.ollama_embedding_model,
        "gemini_api_key_masked": api_key_masked,
        "is_mock_mode": settings.is_mock_mode
    }

@app.post("/api/settings")
def update_settings(req: SettingsRequest, x_admin_password: Optional[str] = Header(None)):
    """
    Updates configuration dynamically. Requires admin password header.
    """
    verify_admin(x_admin_password)
    
    if req.llm_provider is not None:
        settings.llm_provider = req.llm_provider.lower()
    if req.embedding_provider is not None:
        settings.embedding_provider = req.embedding_provider.lower()
    if req.llm_model is not None:
        settings.llm_model = req.llm_model
    if req.embedding_model is not None:
        settings.embedding_model = req.embedding_model
    if req.ollama_host is not None:
        settings.ollama_host = req.ollama_host
    if req.ollama_model is not None:
        settings.ollama_model = req.ollama_model
    if req.ollama_embedding_model is not None:
        settings.ollama_embedding_model = req.ollama_embedding_model
    if req.gemini_api_key is not None:
        val = req.gemini_api_key.strip()
        # Avoid overriding with placeholder strings
        if val not in ["", "***", "null", "undefined"]:
            settings.gemini_api_key = val
            
    print_current_config()
    return {"message": "Settings updated successfully", "settings": get_settings()}

@app.post("/api/admin/verify")
def verify_admin_password(req: VerifyRequest):
    """
    Verifies admin password. Returns success or raises 403.
    """
    if req.password == settings.admin_password:
        return {"status": "success", "message": "Admin session authenticated"}
    raise HTTPException(status_code=403, detail="Invalid admin password")

@app.get("/api/books")
def list_books():
    """
    Retrieves the list of books loaded into the database and their chunk counts.
    Uses direct SQLite query to avoid OOM memory crashes on large databases.
    """
    try:
        import os
        import sqlite3
        
        base_dir = os.getenv("CHROMA_DB_DIR", ".")
        sub_dir = "chroma_db_ollama" if settings.embedding_provider == "ollama" else "chroma_db_backup"
        target_path = os.path.join(base_dir, sub_dir)
        sqlite_path = os.path.join(target_path, "chroma.sqlite3")
        
        if not os.path.exists(sqlite_path):
            return {"books": [], "total_chunks": 0}
            
        conn = sqlite3.connect(sqlite_path)
        cursor = conn.cursor()
        
        try:
            # Query grouped book metadata counts
            cursor.execute(
                "SELECT string_value, COUNT(*) FROM embedding_metadata WHERE key='book' GROUP BY string_value;"
            )
            rows = cursor.fetchall()
            
            books_list = [
                {"name": row[0], "chunk_count": row[1]}
                for row in rows
            ]
            
            # Query total number of chunks
            cursor.execute("SELECT COUNT(*) FROM embeddings;")
            total_chunks = cursor.fetchone()[0]
            
            return {
                "books": books_list,
                "total_chunks": total_chunks
            }
        finally:
            conn.close()
            
    except Exception as e:
        # Fallback to standard client count query if SQLite fails for some reason
        try:
            collection = get_collection()
            count = collection.count()
            return {"books": [], "total_chunks": count, "error": str(e)}
        except:
            raise HTTPException(status_code=500, detail=f"Error listing books: {str(e)}")

@app.post("/api/ingest")
async def trigger_ingest(clear: bool = False, x_admin_password: Optional[str] = Header(None)):
    """
    Triggers book parsing and ingestion and streams progress events to the client.
    Requires admin password header.
    """
    verify_admin(x_admin_password)
    
    if clear:
        print("Clearing database collection...")
        try:
            clear_database()
        except Exception as e:
            print(f"Error clearing database during API request: {e}")
            
    def event_generator():
        try:
            for event in ingest_all_books_generator():
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    """
    Streams a response using the chat history and retrieved spiritual book contexts.
    First chunk yielded is a JSON structure listing the retrieved source references.
    """
    if not request.messages:
        raise HTTPException(status_code=400, detail="Messages list cannot be empty")
        
    user_query = request.messages[-1].content
    
    # Get history excluding current message
    history = [
        {"role": msg.role, "content": msg.content}
        for msg in request.messages[:-1]
    ]
    
    # 1. Retrieve relevant chunks from the database
    try:
        context_chunks = query_documents(user_query, n_results=5)
    except Exception as e:
        print(f"Error querying database: {e}")
        context_chunks = []

    # 2. Generator that streams the sources first, then LLM response
    def sse_generator():
        # First send the retrieved sources list
        sources_payload = {
            "type": "sources",
            "sources": [
                {
                    "id": chunk["id"],
                    "text": chunk["text"],
                    "metadata": chunk["metadata"]
                }
                for chunk in context_chunks
            ]
        }
        # Yield the sources chunk formatted for SSE
        yield f"data: {json.dumps(sources_payload)}\n\n"
        
        # Then stream the text tokens from LLM
        try:
            for text_chunk in generate_chat_stream(user_query, history, context_chunks):
                token_payload = {
                    "type": "token",
                    "text": text_chunk
                }
                yield f"data: {json.dumps(token_payload)}\n\n"
        except Exception as e:
            error_payload = {
                "type": "error",
                "message": f"Streaming error: {str(e)}"
              }
            yield f"data: {json.dumps(error_payload)}\n\n"
            
        # Send done signifier
        done_payload = {"type": "done"}
        yield f"data: {json.dumps(done_payload)}\n\n"

    return StreamingResponse(sse_generator(), media_type="text/event-stream")

@app.post("/api/feedback")
def submit_feedback(req: FeedbackRequest):
    """
    Submits user thumbs-up/down feedback for a query-answer pair.
    """
    try:
        import os
        import json
        
        base_dir = os.getenv("CHROMA_DB_DIR", ".")
        sub_dir = "chroma_db_ollama" if settings.embedding_provider == "ollama" else "chroma_db_backup"
        target_path = os.path.join(base_dir, sub_dir)
        sqlite_path = os.path.join(target_path, "chroma.sqlite3")
        
        sources_str = json.dumps(req.sources)
        save_feedback(sqlite_path, req.question, req.answer, sources_str, req.feedback_value, req.latency_ms)
        return {"status": "success", "message": "Feedback submitted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving feedback: {str(e)}")

@app.get("/api/admin/feedback")
def get_feedback_logs(x_admin_password: Optional[str] = Header(None)):
    """
    Retrieves history of submitted user feedback ratings. Admin only.
    """
    verify_admin(x_admin_password)
    try:
        import os
        import sqlite3
        import json
        
        base_dir = os.getenv("CHROMA_DB_DIR", ".")
        sub_dir = "chroma_db_ollama" if settings.embedding_provider == "ollama" else "chroma_db_backup"
        target_path = os.path.join(base_dir, sub_dir)
        sqlite_path = os.path.join(target_path, "chroma.sqlite3")
        
        if not os.path.exists(sqlite_path):
            return {"feedback": []}
            
        conn = sqlite3.connect(sqlite_path)
        cursor = conn.cursor()
        try:
            cursor.execute(
                "SELECT id, question, answer, sources, feedback_value, latency_ms, timestamp FROM user_feedback ORDER BY timestamp DESC;"
            )
            rows = cursor.fetchall()
            logs = []
            for r in rows:
                logs.append({
                    "id": r[0],
                    "question": r[1],
                    "answer": r[2],
                    "sources": json.loads(r[3]) if r[3] else [],
                    "feedback_value": r[4],
                    "latency_ms": r[5],
                    "timestamp": r[6]
                })
            return {"feedback": logs}
        finally:
            conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving feedback: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=True)
