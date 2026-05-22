import chromadb
from typing import List, Dict
from app.config import CHROMA_DB_PATH
from app.model import get_embedding, get_embeddings_batch

# Initialize ChromaDB persistent client
chroma_client = chromadb.PersistentClient(path=CHROMA_DB_PATH)

def get_collection():
    """
    Get or create the ChromaDB collection for spiritual books.
    """
    # Use L2 (Euclidean distance) or Cosine similarity.
    # Chroma defaults to L2, but cosine is often better for embeddings.
    return chroma_client.get_or_create_collection(
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
    try:
        chroma_client.delete_collection("spiritual_books")
        print("Database collection cleared.")
    except Exception as e:
        print(f"Error clearing database: {e}")
