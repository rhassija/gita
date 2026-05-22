import os
import re
import uuid
import argparse
from typing import Generator, Dict
from pypdf import PdfReader
from app.database import add_documents, add_documents_batch, clear_database, get_collection

BOOKS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../books"))

def parse_structured_txt(file_path: str) -> list[dict]:
    """
    Parses a TXT file containing structured verses in format:
    [Book: Book Name]
    [Chapter: Chapter ID]
    [Verse: Verse ID]
    Verse content here...
    """
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Split by double newlines or blocks
    # Looking for blocks starting with [Book: ...]
    blocks = re.split(r'\n\s*\n', content)
    chunks = []
    
    current_book = os.path.basename(file_path).replace(".txt", "")
    current_chapter = "1"
    current_verse = ""
    
    for block in blocks:
        block = block.strip()
        if not block:
            continue
            
        # Parse tags
        book_match = re.search(r'\[Book:\s*([^\]]+)\]', block)
        chapter_match = re.search(r'\[Chapter:\s*([^\]]+)\]', block)
        verse_match = re.search(r'\[Verse:\s*([^\]]+)\]', block)
        
        # Clean tags from the block text to leave only the scripture content
        clean_text = block
        if book_match:
            current_book = book_match.group(1).strip()
            clean_text = clean_text.replace(book_match.group(0), "")
        if chapter_match:
            current_chapter = chapter_match.group(1).strip()
            clean_text = clean_text.replace(chapter_match.group(0), "")
        if verse_match:
            current_verse = verse_match.group(1).strip()
            clean_text = clean_text.replace(verse_match.group(0), "")
            
        clean_text = clean_text.strip()
        if not clean_text:
            continue
            
        chunks.append({
            "text": clean_text,
            "metadata": {
                "book": current_book,
                "chapter": current_chapter,
                "verse": current_verse,
                "source_type": "text_structured"
            }
        })
        
    return chunks

def parse_plain_txt(file_path: str) -> list[dict]:
    """
    Parses a plain text file by splitting it into paragraphs/chunks.
    """
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Split by double newlines (paragraphs)
    paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
    chunks = []
    book_name = os.path.basename(file_path).replace(".txt", "")
    
    for idx, para in enumerate(paragraphs):
        # If paragraph is too small, we might skip it or merge it, but for now just add
        if len(para) < 20:
            continue
        chunks.append({
            "text": para,
            "metadata": {
                "book": book_name,
                "chapter": "General",
                "paragraph": str(idx + 1),
                "source_type": "text_plain"
            }
        })
    return chunks

def parse_pdf(file_path: str) -> list[dict]:
    """
    Parses a PDF file page by page, adding page number metadata.
    """
    reader = PdfReader(file_path)
    chunks = []
    book_name = os.path.basename(file_path).replace(".pdf", "")
    
    for page_num, page in enumerate(reader.pages):
        text = page.extract_text()
        if not text or len(text.strip()) < 50:
            continue
            
        # Clean text basic whitespace
        clean_text = re.sub(r'\s+', ' ', text).strip()
        
        chunks.append({
            "text": clean_text,
            "metadata": {
                "book": book_name,
                "page": str(page_num + 1),
                "chapter": "N/A",
                "source_type": "pdf"
            }
        })
    return chunks

def ingest_all_books_generator() -> Generator[dict, None, None]:
    """
    Generator that scans the books directory, parses files, embeds and adds them
    to ChromaDB in batches, and yields progress/status updates.
    """
    if not os.path.exists(BOOKS_DIR):
        yield {"type": "error", "message": f"Books directory not found at: {BOOKS_DIR}"}
        return

    files = [f for f in os.listdir(BOOKS_DIR) if f.endswith(".txt") or f.endswith(".pdf")]
    if not files:
        yield {"type": "warning", "message": "No books found in books directory to ingest."}
        return

    yield {"type": "info", "message": f"Found {len(files)} files in books directory."}

    # Fetch already ingested books from database
    existing_books = set()
    try:
        coll = get_collection()
        count = coll.count()
        if count > 0:
            res = coll.get(include=["metadatas"])
            if res and res["metadatas"]:
                for meta in res["metadatas"]:
                    if meta and "book" in meta:
                        existing_books.add(meta["book"])
            yield {"type": "info", "message": f"Found {len(existing_books)} unique book(s) already in database: {list(existing_books)}"}
    except Exception as e:
        yield {"type": "info", "message": f"Could not read existing books from database (will process all): {e}"}

    processed_any = False
    for file_name in files:
        file_path = os.path.join(BOOKS_DIR, file_name)
        
        # Pre-parse check based on filename (without extension)
        pred_book_name = file_name.replace(".pdf", "").replace(".txt", "")
        if pred_book_name in existing_books:
            yield {"type": "skip", "file": file_name, "book": pred_book_name}
            continue
            
        try:
            yield {"type": "parsing", "file": file_name}
            if file_name.endswith(".pdf"):
                file_chunks = parse_pdf(file_path)
            else:
                # Read start to detect structured format
                with open(file_path, "r", encoding="utf-8") as f:
                    sample = f.read(500)
                if "[Book:" in sample or "[Chapter:" in sample:
                    file_chunks = parse_structured_txt(file_path)
                else:
                    file_chunks = parse_plain_txt(file_path)
            
            if not file_chunks:
                yield {"type": "warning", "message": f"No text could be extracted from {file_name}."}
                continue

            # Post-parse check in case structured book name differs from filename
            actual_book_name = file_chunks[0]["metadata"].get("book", pred_book_name)
            if actual_book_name in existing_books:
                yield {"type": "skip", "file": file_name, "book": actual_book_name}
                continue
                
            processed_any = True
            yield {"type": "parsed", "file": file_name, "book": actual_book_name, "chunks": len(file_chunks)}
            
            # Ingest in batches of 250
            total_chunks = len(file_chunks)
            batch_size = 250
            for i in range(0, total_chunks, batch_size):
                batch = file_chunks[i : i + batch_size]
                batch_texts = [c["text"] for c in batch]
                batch_metadatas = [c["metadata"] for c in batch]
                batch_ids = [str(uuid.uuid4()) for _ in range(len(batch))]
                
                # Perform batch addition
                add_documents_batch(batch_texts, batch_metadatas, batch_ids)
                
                yield {
                    "type": "progress",
                    "file": file_name,
                    "book": actual_book_name,
                    "current": min(i + batch_size, total_chunks),
                    "total": total_chunks
                }
                
            yield {"type": "success", "file": file_name, "book": actual_book_name, "chunks": total_chunks}
        except Exception as e:
            yield {"type": "error", "message": f"Error processing {file_name}: {str(e)}"}

    if not processed_any:
        yield {"type": "done", "message": "All books are already loaded. No new content to ingest.", "total_chunks": get_collection().count()}
        return

    # Verify count
    try:
        coll = get_collection()
        yield {"type": "done", "message": f"Ingestion completed. Current collection document count: {coll.count()}", "total_chunks": coll.count()}
    except Exception as e:
        yield {"type": "done", "message": f"Ingestion completed, but failed to fetch final count: {e}", "total_chunks": 0}

def ingest_all_books():
    """
    Scans the books directory, parses files, and adds them to ChromaDB.
    Prints status and progress updates to standard output.
    """
    for event in ingest_all_books_generator():
        etype = event["type"]
        if etype == "info":
            print(f"ℹ️ {event['message']}")
        elif etype == "skip":
            print(f"⏩ Skipping {event['file']} (already ingested as '{event['book']}')")
        elif etype == "parsing":
            print(f"🔍 Parsing {event['file']}...")
        elif etype == "parsed":
            print(f"📖 Extracted {event['chunks']} chunks for '{event['book']}'")
        elif etype == "progress":
            print(f"   📥 Ingesting '{event['book']}': {event['current']} / {event['total']} chunks...")
        elif etype == "success":
            print(f"✅ Successfully ingested '{event['book']}' ({event['chunks']} chunks)")
        elif etype == "warning":
            print(f"⚠️ Warning: {event['message']}")
        elif etype == "error":
            print(f"❌ Error: {event['message']}")
        elif etype == "done":
            print(f"\n🎉 {event['message']}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest spiritual books into vector store.")
    parser.add_argument("--clear", action="store_true", help="Clear the database before ingestion.")
    args = parser.parse_args()
    
    if args.clear:
        print("Clearing database...")
        clear_database()
        
    ingest_all_books()
