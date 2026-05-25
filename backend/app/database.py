import os
import sqlite3
import chromadb
from typing import List, Dict
from app.config import settings
from app.model import get_embedding, get_embeddings_batch

# Cache of persistent client to prevent multiple instantiations
_active_client = None
_active_path = None

def init_feedback_db(sqlite_path: str):
    """
    Creates user_feedback table inside the Chroma SQLite database.
    """
    conn = sqlite3.connect(sqlite_path)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question TEXT,
            answer TEXT,
            sources TEXT,
            feedback_value INTEGER,
            latency_ms REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()
    conn.close()

def save_feedback(sqlite_path: str, question: str, answer: str, sources: str, feedback_value: int, latency_ms: float):
    """
    Saves user feedback rating for a specific question/answer.
    """
    conn = sqlite3.connect(sqlite_path)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO user_feedback (question, answer, sources, feedback_value, latency_ms)
        VALUES (?, ?, ?, ?, ?);
    """, (question, answer, sources, feedback_value, latency_ms))
    conn.commit()
    conn.close()

def get_chroma_client():
    """
    Get the ChromaDB persistent client dynamically based on settings.
    If settings change, re-instantiates client.
    """
    global _active_client, _active_path
    
    base_dir = os.getenv("CHROMA_DB_DIR", ".")
    sub_dir = "chroma_db_ollama" if settings.embedding_provider == "ollama" else "chroma_db_backup"
    target_path = os.path.join(base_dir, sub_dir)
    
    if _active_client is None or _active_path != target_path:
        print(f"🔄 Switched database connection path to: {target_path}")
        _active_path = target_path
        _active_client = chromadb.PersistentClient(path=target_path)
        
        # Initialize custom user feedback database
        try:
            sqlite_path = os.path.join(target_path, "chroma.sqlite3")
            init_feedback_db(sqlite_path)
        except Exception as e:
            print(f"⚠️ Failed to initialize feedback table in SQLite: {e}")
        
    return _active_client

def get_collection():
    """
    Get or create the ChromaDB collection for spiritual books.
    """
    client = get_chroma_client()
    return client.get_or_create_collection(
        name="spiritual_books",
        metadata={"hnsw:space": "cosine"}
    )

def add_documents_batch(texts: List[str], metadatas: List[Dict], ids: List[str]):
    """
    Generate embeddings and add a single batch of documents to ChromaDB.
    """
    collection = get_collection()
    embeddings = get_embeddings_batch(texts)
    collection.add(
        documents=texts,
        embeddings=embeddings,
        metadatas=metadatas,
        ids=ids
    )

def add_documents(texts: List[str], metadatas: List[Dict], ids: List[str]):
    """
    Generate embeddings and add documents to the vector store in safe batches.
    """
    batch_size = 250
    total = len(texts)
    for i in range(0, total, batch_size):
        add_documents_batch(
            texts[i : i + batch_size],
            metadatas[i : i + batch_size],
            ids[i : i + batch_size]
        )

def query_documents(query_text: str, n_results: int = 5) -> List[Dict]:
    """
    Embed the query and retrieve the top matching documents from ChromaDB.
    """
    collection = get_collection()
    
    # Check if collection is empty
    if collection.count() == 0:
        return []
        
    query_emb = get_embedding(query_text, is_query=True)
    
    results = collection.query(
        query_embeddings=[query_emb],
        n_results=n_results
    )
    
    formatted_results = []
    if not results or not results["documents"] or not results["documents"][0]:
        return []
        
    for i in range(len(results["documents"][0])):
        formatted_results.append({
            "id": results["ids"][0][i],
            "text": results["documents"][0][i],
            "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
            "distance": results["distances"][0][i] if results["distances"] else 0.0
        })
        
    return formatted_results

def clear_database():
    """
    Clear all entries from the spiritual books collection.
    """
    client = get_chroma_client()
    try:
        client.delete_collection("spiritual_books")
        print("Database collection cleared.")
    except Exception as e:
        print(f"Error clearing database: {e}")
