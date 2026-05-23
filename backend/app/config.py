import os
from dotenv import load_dotenv

# Load environment variables from .env if it exists
load_dotenv(override=True)

# We try to get from OS environment first (which might be injected by the system),
# then fall back to the loaded .env file.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
if GEMINI_API_KEY == "your_gemini_api_key_here":
    GEMINI_API_KEY = ""

CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "./chroma_db")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "models/gemini-embedding-2")
LLM_MODEL = os.getenv("LLM_MODEL", "gemini-2.5-flash")

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini").lower()
EMBEDDING_PROVIDER = os.getenv("EMBEDDING_PROVIDER", "gemini").lower()
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3:4b")
OLLAMA_EMBEDDING_MODEL = os.getenv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text")

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Check if Gemini key is available for embeddings/Gemini LLM
IS_MOCK_MODE = not bool(GEMINI_API_KEY)

print(f"\nConfiguration loaded: LLM_PROVIDER={LLM_PROVIDER}, EMBEDDING_PROVIDER={EMBEDDING_PROVIDER}")
if LLM_PROVIDER == "ollama":
    print(f"Ollama local LLM active. Host: {OLLAMA_HOST}, Model: {OLLAMA_MODEL}")
elif LLM_PROVIDER == "gemini":
    if IS_MOCK_MODE:
        print("⚠️ WARNING: GEMINI_API_KEY is not set. LLM will run in MOCK MODE.")
    else:
        print(f"Gemini cloud LLM active. Model: {LLM_MODEL}")
else:
    print(f"⚠️ WARNING: Unknown LLM_PROVIDER '{LLM_PROVIDER}'. Falling back to Mock Mode for chat.")

if EMBEDDING_PROVIDER == "ollama":
    print(f"Ollama local embeddings active. Host: {OLLAMA_HOST}, Model: {OLLAMA_EMBEDDING_MODEL}")
elif EMBEDDING_PROVIDER == "gemini":
    if IS_MOCK_MODE:
        print("⚠️ WARNING: GEMINI_API_KEY is not set. Embeddings will run in MOCK MODE.")
    else:
        print(f"Gemini cloud embeddings active. Model: {EMBEDDING_MODEL}")
else:
    print(f"⚠️ WARNING: Unknown EMBEDDING_PROVIDER '{EMBEDDING_PROVIDER}'. Falling back to Mock Mode for embeddings.")
print()
