import os
from dotenv import load_dotenv

# Load environment variables from .env if it exists
load_dotenv(override=False)

class AppSettings:
    def __init__(self):
        self.gemini_api_key = os.getenv("GEMINI_API_KEY", "")
        if self.gemini_api_key == "your_gemini_api_key_here":
            self.gemini_api_key = ""
            
        self.llm_provider = os.getenv("LLM_PROVIDER", "gemini").lower()
        self.embedding_provider = os.getenv("EMBEDDING_PROVIDER", "gemini").lower()
        self.llm_model = os.getenv("LLM_MODEL", "gemini-2.5-flash")
        self.embedding_model = os.getenv("EMBEDDING_MODEL", "models/gemini-embedding-2")
        
        self.ollama_host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
        self.ollama_model = os.getenv("OLLAMA_MODEL", "gemma3:4b")
        self.ollama_embedding_model = os.getenv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text")
        
        self.admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
        
    @property
    def is_mock_mode(self) -> bool:
        return not bool(self.gemini_api_key)

settings = AppSettings()

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

def print_current_config():
    print(f"\nConfiguration active: LLM_PROVIDER={settings.llm_provider}, EMBEDDING_PROVIDER={settings.embedding_provider}")
    if settings.llm_provider == "ollama":
        print(f"Ollama local LLM active. Host: {settings.ollama_host}, Model: {settings.ollama_model}")
    elif settings.llm_provider == "gemini":
        if settings.is_mock_mode:
            print("⚠️ WARNING: GEMINI_API_KEY is not set. LLM will run in MOCK MODE.")
        else:
            print(f"Gemini cloud LLM active. Model: {settings.llm_model}")
    else:
        print(f"⚠️ WARNING: Unknown LLM_PROVIDER '{settings.llm_provider}'. Mock Mode active.")

    if settings.embedding_provider == "ollama":
        print(f"Ollama local embeddings active. Host: {settings.ollama_host}, Model: {settings.ollama_embedding_model}")
    elif settings.embedding_provider == "gemini":
        if settings.is_mock_mode:
            print("⚠️ WARNING: GEMINI_API_KEY is not set. Embeddings will run in MOCK MODE.")
        else:
            print(f"Gemini cloud embeddings active. Model: {settings.embedding_model}")
    else:
        print(f"⚠️ WARNING: Unknown EMBEDDING_PROVIDER '{settings.embedding_provider}'. Mock Mode active.")
    print()

print_current_config()
