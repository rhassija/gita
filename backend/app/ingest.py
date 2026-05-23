import os
import re
import uuid
import argparse
from typing import Generator, Dict, List
from pypdf import PdfReader
from app.database import add_documents, add_documents_batch, clear_database, get_collection

BOOKS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../books"))

def parse_structured_txt_generator(file_path: str) -> Generator[Dict, None, None]:
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
    blocks = re.split(r'\n\s*\n', content)
    
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
            
        yield {
            "text": clean_text,
            "metadata": {
                "book": current_book,
                "chapter": current_chapter,
                "verse": current_verse,
                "source_type": "text_structured"
            }
        }

def parse_plain_txt_generator(file_path: str) -> Generator[Dict, None, None]:
    """
    Parses a plain text file by splitting it into paragraphs/chunks.
    """
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Split by double newlines (paragraphs)
    paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
    book_name = os.path.basename(file_path).replace(".txt", "")
    
    for idx, para in enumerate(paragraphs):
        if len(para) < 20:
            continue
        yield {
            "text": para,
            "metadata": {
                "book": book_name,
                "chapter": "General",
                "paragraph": str(idx + 1),
                "source_type": "text_plain"
            }
        }

def ingest_all_books_generator() -> Generator[Dict, None, None]:
    """
    Generator that scans the books directory, parses files page-by-page/chunk-by-chunk,
    embeds and adds them to ChromaDB in streaming batches of 200, and yields progress/status updates.
    """
    if not os.path.exists(BOOKS_DIR):
        yield {"type": "error", "message": f"Books directory not found at: {BOOKS_DIR}"}
        return

    # Filter out archive files, only load TXT and PDF
    files = sorted([f for f in os.listdir(BOOKS_DIR) if f.endswith(".txt") or f.endswith(".pdf")])
    if not files:
        yield {"type": "warning", "message": "No books found in books directory to ingest."}
        return

    yield {"type": "info", "message": f"Found {len(files)} files in books directory."}

    # Fetch already ingested books from database to support incremental ingestion
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
            yield {"type": "info", "message": f"Found {len(existing_books)} unique book(s) already in database."}
    except Exception as e:
        yield {"type": "info", "message": f"Could not read existing books from database (will process all): {e}"}

    processed_any = False
    
    for file_name in files:
        file_path = os.path.join(BOOKS_DIR, file_name)
        pred_book_name = file_name.replace(".pdf", "").replace(".txt", "")
        
        # Incremental skip check based on predicted book name
        if pred_book_name in existing_books:
            yield {"type": "skip", "file": file_name, "book": pred_book_name}
            continue
            
        try:
            yield {"type": "parsing", "file": file_name}
            
            batch_size = 200
            current_batch = []
            inserted_count = 0
            
            # Setup the specific chunk stream generator for this file type
            if file_name.endswith(".pdf"):
                reader = PdfReader(file_path)
                total_pages = len(reader.pages)
                
                def pdf_stream():
                    for page_idx, page in enumerate(reader.pages):
                        try:
                            text = page.extract_text()
                            if not text or len(text.strip()) < 50:
                                continue
                            clean_text = re.sub(r'\s+', ' ', text).strip()
                            yield {
                                "text": clean_text,
                                "metadata": {
                                    "book": pred_book_name,
                                    "page": str(page_idx + 1),
                                    "chapter": "N/A",
                                    "source_type": "pdf"
                                }
                            }
                        except Exception as page_err:
                            print(f"Error parsing page {page_idx + 1} of {file_name}: {page_err}")
                
                chunks_generator = pdf_stream()
                total_units = total_pages
            else:
                with open(file_path, "r", encoding="utf-8") as f:
                    sample = f.read(500)
                if "[Book:" in sample or "[Chapter:" in sample:
                    chunks_generator = parse_structured_txt_generator(file_path)
                else:
                    chunks_generator = parse_plain_txt_generator(file_path)
                total_units = 0
            
            # Process the generator stream and index in batches
            is_skipped = False
            for chunk in chunks_generator:
                current_batch.append(chunk)
                
                # Check structural book name (could differ from filename in structured txt files)
                if inserted_count == 0 and len(current_batch) == 1:
                    actual_book_name = chunk["metadata"].get("book", pred_book_name)
                    if actual_book_name != pred_book_name and actual_book_name in existing_books:
                        yield {"type": "skip", "file": file_name, "book": actual_book_name}
                        is_skipped = True
                        break
                
                if len(current_batch) >= batch_size:
                    batch_texts = [c["text"] for c in current_batch]
                    batch_metadatas = [c["metadata"] for c in current_batch]
                    batch_ids = [str(uuid.uuid4()) for _ in range(len(current_batch))]
                    
                    add_documents_batch(batch_texts, batch_metadatas, batch_ids)
                    inserted_count += len(current_batch)
                    processed_any = True
                    current_batch = []
                    
                    yield {
                        "type": "progress",
                        "file": file_name,
                        "book": pred_book_name,
                        "current": inserted_count,
                        "total": max(total_units, inserted_count)
                    }
            
            if is_skipped:
                continue
                
            # Flush any remaining items in the buffer
            if current_batch:
                batch_texts = [c["text"] for c in current_batch]
                batch_metadatas = [c["metadata"] for c in current_batch]
                batch_ids = [str(uuid.uuid4()) for _ in range(len(current_batch))]
                
                add_documents_batch(batch_texts, batch_metadatas, batch_ids)
                inserted_count += len(current_batch)
                processed_any = True
                current_batch = []
                
                yield {
                    "type": "progress",
                    "file": file_name,
                    "book": pred_book_name,
                    "current": inserted_count,
                    "total": inserted_count
                }
                
            if inserted_count > 0:
                yield {"type": "success", "file": file_name, "book": pred_book_name, "chunks": inserted_count}
            else:
                yield {"type": "warning", "message": f"No text could be indexed from {file_name}."}
                
        except Exception as e:
            yield {"type": "error", "message": f"Error processing {file_name}: {str(e)}"}

    if not processed_any:
        yield {"type": "done", "message": "All books are already loaded. No new content to ingest.", "total_chunks": get_collection().count()}
        return

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
        elif etype == "progress":
            print(f"   📥 Ingesting '{event['book']}': {event['current']} chunks processed...")
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
