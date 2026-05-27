import random
import hashlib
import requests
import json
from typing import Generator, List, Dict
import google.generativeai as genai
from app.config import settings

def get_embedding(text: str, is_query: bool = False) -> List[float]:
    """
    Generate embedding for a single text using Ollama, Gemini API, or a mock generator.
    """
    if settings.embedding_provider == "ollama":
        prefix = ""
        if "nomic" in settings.ollama_embedding_model.lower():
            prefix = "search_query: " if is_query else "search_document: "
        
        try:
            url = f"{settings.ollama_host}/api/embed"
            payload = {
                "model": settings.ollama_embedding_model,
                "input": f"{prefix}{text}"
            }
            response = requests.post(url, json=payload)
            response.raise_for_status()
            res_json = response.json()
            if "embeddings" in res_json and res_json["embeddings"]:
                return res_json["embeddings"][0]
            
            # Fallback to /api/embeddings if /api/embed response was empty
            url_fallback = f"{settings.ollama_host}/api/embeddings"
            payload_fallback = {
                "model": settings.ollama_embedding_model,
                "prompt": f"{prefix}{text}"
            }
            response_fb = requests.post(url_fallback, json=payload_fallback)
            response_fb.raise_for_status()
            res_fb_json = response_fb.json()
            if "embedding" in res_fb_json:
                return res_fb_json["embedding"]
            raise ValueError(f"Unexpected response format from Ollama: {res_json}")
        except Exception as e:
            print(f"Error generating embedding via Ollama API: {e}")
            dim = 768
            hasher = hashlib.md5(text.encode('utf-8'))
            seed = int(hasher.hexdigest(), 16) % 1000000
            rng = random.Random(seed)
            return [rng.uniform(-0.1, 0.1) for _ in range(dim)]

    # gemini-embedding-2 uses 3072 dimensions, older/default models use 768
    dim = 3072 if "embedding-2" in settings.embedding_model else 768

    if settings.is_mock_mode:
        # Generate a deterministic mock vector based on the MD5 hash of the text
        hasher = hashlib.md5(text.encode('utf-8'))
        seed = int(hasher.hexdigest(), 16) % 1000000
        rng = random.Random(seed)
        return [rng.uniform(-0.1, 0.1) for _ in range(dim)]
    
    try:
        genai.configure(api_key=settings.gemini_api_key)
        task_type = "retrieval_query" if is_query else "retrieval_document"
        result = genai.embed_content(
            model=settings.embedding_model,
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
    Generate embeddings for a list of texts using Ollama, Gemini API, or a mock generator.
    """
    if settings.embedding_provider == "ollama":
        prefix = "search_document: " if "nomic" in settings.ollama_embedding_model.lower() else ""
        prefixed_texts = [f"{prefix}{text}" for text in texts]
        try:
            url = f"{settings.ollama_host}/api/embed"
            payload = {
                "model": settings.ollama_embedding_model,
                "input": prefixed_texts
            }
            response = requests.post(url, json=payload)
            response.raise_for_status()
            res_json = response.json()
            if "embeddings" in res_json:
                return res_json["embeddings"]
            raise ValueError(f"Unexpected response format from Ollama /api/embed: {res_json}")
        except Exception as e:
            print(f"Error generating batch embeddings via Ollama API: {e}. Falling back to individual generation.")
            embeddings = []
            for text in texts:
                embeddings.append(get_embedding(text, is_query=False))
            return embeddings

    dim = 3072 if "embedding-2" in settings.embedding_model else 768

    if settings.is_mock_mode:
        embeddings = []
        for text in texts:
            hasher = hashlib.md5(text.encode('utf-8'))
            seed = int(hasher.hexdigest(), 16) % 1000000
            rng = random.Random(seed)
            embeddings.append([rng.uniform(-0.1, 0.1) for _ in range(dim)])
        return embeddings
        
    try:
        genai.configure(api_key=settings.gemini_api_key)
        task_type = "retrieval_document"
        result = genai.embed_content(
            model=settings.embedding_model,
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
        "You are 'AntarJyoti', a succinct, peaceful, and wise spiritual guide dedicated exclusively to spiritual and Hindu religion-based teachings.\n\n"
        "Strict Guidelines:\n"
        "1. Scope Constraint: Answer ONLY questions that are spiritual and related to the Hindu religion. If the query is off-topic, unrelated, or not specific to this context, do not entertain it. Reply strictly with: 'I don't know' or 'I am not designed to answer these questions.'\n"
        "2. No Hallucinations or Lies: At all times, you must not lie, hallucinate, or provide false/invented information. If the provided Sources do not contain the data needed to answer the question, do not make up an answer. Reply strictly with: 'I don't know' or 'I am not designed to answer these questions.'\n"
        "3. Succinct Structure: Keep your response very succinct. Start with a brief, high-level summary of the answer first, followed by key supporting details.\n"
        "4. Citing Sources: Ground your answers in the provided Sources. If a Source is relevant, you MUST cite it inline using the format `[Source #1]`, `[Source #2]`, etc., near the sentence where you referenced it.\n"
        "5. Tone: Speak in a calm, respectful, and reflective tone."
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

    if settings.llm_provider == "ollama":
        try:
            yield f"*(System Notice: Running locally via Ollama with model `{settings.ollama_model}`)* \n\n"
            url = f"{settings.ollama_host}/api/generate"
            payload = {
                "model": settings.ollama_model,
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

    if settings.llm_provider == "mock" or (settings.llm_provider == "gemini" and settings.is_mock_mode):
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
        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel(settings.llm_model)
        response = model.generate_content(full_prompt, stream=True)
        for chunk in response:
            if chunk.text:
                yield chunk.text
    except Exception as e:
        print(f"Error during Gemini completion: {e}")
        yield f"*(An error occurred: {str(e)}. Falling back to reflection)*\n\n"
        yield "My thoughts are clouded by a temporary disturbance in the connection. Let us pause, reflect on the silence, and try again in a moment."
