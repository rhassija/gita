import random
import hashlib
import requests
import json
from typing import Generator, List, Dict
import google.generativeai as genai
from app.config import (
    GEMINI_API_KEY,
    EMBEDDING_MODEL,
    LLM_MODEL,
    IS_MOCK_MODE,
    LLM_PROVIDER,
    OLLAMA_HOST,
    OLLAMA_MODEL
)

if not IS_MOCK_MODE:
    genai.configure(api_key=GEMINI_API_KEY)

def get_embedding(text: str, is_query: bool = False) -> List[float]:
    """
    Generate embedding for a single text using Gemini API or a mock generator.
    """
    # gemini-embedding-2 uses 3072 dimensions, older/default models use 768
    dim = 3072 if "embedding-2" in EMBEDDING_MODEL else 768

    if IS_MOCK_MODE:
        # Generate a deterministic mock vector based on the MD5 hash of the text
        hasher = hashlib.md5(text.encode('utf-8'))
        seed = int(hasher.hexdigest(), 16) % 1000000
        rng = random.Random(seed)
        return [rng.uniform(-0.1, 0.1) for _ in range(dim)]
    
    try:
        task_type = "retrieval_query" if is_query else "retrieval_document"
        result = genai.embed_content(
            model=EMBEDDING_MODEL,
            content=text,
            task_type=task_type
        )
        return result['embedding']
    except Exception as e:
        print(f"Error generating embedding via Gemini API: {e}")
        # Fallback to random deterministic vector on failure
        hasher = hashlib.md5(text.encode('utf-8'))
        seed = int(hasher.hexdigest(), 16) % 1000000
        rng = random.Random(seed)
        return [rng.uniform(-0.1, 0.1) for _ in range(dim)]

def get_embeddings_batch(texts: List[str]) -> List[List[float]]:
    """
    Generate embeddings for a list of texts using Gemini API or a mock generator.
    """
    dim = 3072 if "embedding-2" in EMBEDDING_MODEL else 768

    if IS_MOCK_MODE:
        embeddings = []
        for text in texts:
            hasher = hashlib.md5(text.encode('utf-8'))
            seed = int(hasher.hexdigest(), 16) % 1000000
            rng = random.Random(seed)
            embeddings.append([rng.uniform(-0.1, 0.1) for _ in range(dim)])
        return embeddings
        
    try:
        task_type = "retrieval_document"
        result = genai.embed_content(
            model=EMBEDDING_MODEL,
            content=texts,
            task_type=task_type
        )
        return result['embedding']
    except Exception as e:
        print(f"Error generating batch embeddings via Gemini API: {e}. Falling back to individual generation.")
        embeddings = []
        for text in texts:
            embeddings.append(get_embedding(text, is_query=False))
        return embeddings


def generate_chat_stream(
    query: str, 
    history: List[Dict[str, str]], 
    context_chunks: List[Dict]
) -> Generator[str, None, None]:
    """
    Generate a streaming response using Gemini API or a mock generator.
    Uses the retrieved context chunks and chat history.
    """
    # 1. Build context string
    context_str = ""
    for idx, chunk in enumerate(context_chunks):
        metadata = chunk.get("metadata", {})
        book = metadata.get("book", "Unknown Book")
        chapter = metadata.get("chapter", "N/A")
        verse = metadata.get("verse", "")
        page = metadata.get("page", "")
        
        ref = f"{book}, Chapter {chapter}"
        if verse:
            ref += f", Verse {verse}"
        elif page:
            ref += f", Page {page}"
            
        context_str += f"--- Source [{idx + 1}]: {ref} ---\n{chunk['text']}\n\n"

    # 2. Build system prompt / instructions
    system_prompt = (
        "You are 'AntarJyoti', a peaceful, compassionate, and wise spiritual guide.\n"
        "Your goal is to answer the user's questions based on the provided spiritual teachings context.\n\n"
        "Guidelines:\n"
        "1. Speak in a calm, respectful, and reflective tone.\n"
        "2. Ground your answers in the provided Sources. If a Source is relevant, you MUST cite it inline "
        "using the format `[Source #1]`, `[Source #2]`, etc. near the sentence where you referenced it.\n"
        "3. Do not invent verses or quotes that are not in the context. If the source material does not "
        "contain the answer or if you are unsure, gently explain that you couldn't find a direct reference in the "
        "current teachings, but offer a general spiritual reflection.\n"
        "4. Structure your response clearly using paragraphs or lists if helpful.\n"
        "5. Keep the focus on spiritual growth, peace, mindfulness, and self-realization."
    )

    # 3. Compile prompt
    # Construct history block
    history_str = ""
    for msg in history:
        role = "Seeker" if msg["role"] == "user" else "Guide"
        history_str += f"{role}: {msg['content']}\n"

    full_prompt = (
        f"{system_prompt}\n\n"
        f"--- SPIRITUAL CONTEXT ---\n"
        f"{context_str}\n"
        f"--- CONVERSATION HISTORY ---\n"
        f"{history_str}"
        f"Seeker (Current Question): {query}\n"
        f"Guide (Response incorporating Sources with inline citations e.g. [Source #1]):"
    )

    if LLM_PROVIDER == "ollama":
        try:
            yield f"*(System Notice: Running locally via Ollama with model `{OLLAMA_MODEL}`)* \n\n"
            url = f"{OLLAMA_HOST}/api/generate"
            payload = {
                "model": OLLAMA_MODEL,
                "prompt": full_prompt,
                "stream": True
            }
            response = requests.post(url, json=payload, stream=True)
            response.raise_for_status()
            
            for line in response.iter_lines():
                if line:
                    data = json.loads(line.decode('utf-8'))
                    token = data.get("response", "")
                    if token:
                        yield token
            return
        except Exception as e:
            print(f"Error during Ollama completion: {e}")
            yield f"*(An error occurred calling Ollama: {str(e)}. Falling back to reflection)*\n\n"
            yield "I was unable to connect to the local Ollama service. Let us pause, reflect on the silence, and try again."
            return

    if LLM_PROVIDER == "mock" or (LLM_PROVIDER == "gemini" and IS_MOCK_MODE):
        yield "*(System Notice: Running in Offline Mock Mode)* \n\n"
        if not context_chunks:
            yield "Greetings, seeker. I could not find any specific teachings in my records regarding this. In quiet meditation, we find that the answers often lie within. What else would you like to reflect upon?"
            return
            
        # Simulate generating a response incorporating retrieved chunks
        yield "Peace be with you. In the teachings we have, there are relevant guidelines: \n\n"
        
        # Stream the source content in a synthesized format
        for idx, chunk in enumerate(context_chunks):
            metadata = chunk.get("metadata", {})
            book = metadata.get("book", "Unknown Book")
            chapter = metadata.get("chapter", "")
            verse = metadata.get("verse", "")
            ref = f"{book} Ch {chapter}" + (f" V {verse}" if verse else "")
            
            chunk_summary = chunk['text'][:120] + "..." if len(chunk['text']) > 120 else chunk['text']
            yield f"Regarding this, we find in **{ref}** that: \"{chunk_summary}\" `[Source #{idx+1}]`.\n\n"
            
        yield "This reminds us to perform our duties with dedication but without anxiety for the results, anchoring ourselves in the present moment."
        return

    try:
        model = genai.GenerativeModel(LLM_MODEL)
        response = model.generate_content(full_prompt, stream=True)
        for chunk in response:
            if chunk.text:
                yield chunk.text
    except Exception as e:
        print(f"Error during Gemini completion: {e}")
        yield f"*(An error occurred: {str(e)}. Falling back to reflection)*\n\n"
        yield "My thoughts are clouded by a temporary disturbance in the connection. Let us pause, reflect on the silence, and try again in a moment."
