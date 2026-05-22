import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Optional

from app.config import HOST, PORT
from app.database import query_documents, get_collection
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

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}

@app.get("/api/books")
def list_books():
    """
    Retrieves the list of books loaded into the database and their chunk counts.
    """
    try:
        collection = get_collection()
        count = collection.count()
        if count == 0:
            return {"books": [], "total_chunks": 0}
            
        # Retrieve metadata for all documents to find unique book names
        # Note: For massive datasets, collection.get(include=["metadatas"]) is slow,
        # but for typical book libraries (<10,000 chunks) it works fast.
        result = collection.get(include=["metadatas"])
        
        books_summary = {}
        if result and result["metadatas"]:
            for meta in result["metadatas"]:
                book_name = meta.get("book", "Unknown Book")
                books_summary[book_name] = books_summary.get(book_name, 0) + 1
                
        books_list = [
            {"name": name, "chunk_count": chunk_count}
            for name, chunk_count in books_summary.items()
        ]
        
        return {
            "books": books_list,
            "total_chunks": count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing books: {str(e)}")

@app.post("/api/ingest")
async def trigger_ingest():
    """
    Triggers book parsing and ingestion and streams progress events to the client.
    """
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
        # We fetch top 5 relevant chunks
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=True)
