import React, { useState, useEffect, useRef } from "react";

interface Source {
  id: string;
  text: string;
  metadata: {
    book: string;
    chapter: string;
    verse?: string;
    page?: string;
    source_type?: string;
  };
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

interface Book {
  name: string;
  chunk_count: number;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://antarjyoti-backend.fly.dev";

// Auto-bypass localtunnel warning page and inject admin password for API calls
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : (input instanceof Request ? input.url : "");
  
  init = init || {};
  const headers = new Headers(init.headers || {});
  
  if (url.includes("loca.lt")) {
    headers.set("Bypass-Tunnel-Reminder", "true");
  }
  
  // Automatically inject admin password if saved locally
  const adminPassword = localStorage.getItem("antarjyoti_admin_password");
  if (adminPassword && (url.includes(API_BASE) || url.startsWith("/api/"))) {
    headers.set("X-Admin-Password", adminPassword);
  }
  
  if (input instanceof Request) {
    const newRequestInit = { ...init };
    input.headers.forEach((value, key) => {
      if (!headers.has(key)) {
        headers.set(key, value);
      }
    });
    return originalFetch(new Request(input, { headers }), newRequestInit);
  }
  
  init.headers = headers;
  return originalFetch(input, init);
};

const SUGGESTIONS = [
  "What is the meaning of performing duty without attachment?",
  "Explain the cycle of attachment, desire, and anger according to Chapter 2.",
  "How does the teacher describe self-realization?",
  "What promise is made to those who worship with undivided devotion?"
];

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hare Krishna! I am **AntarJyoti** your AI spiritual guide. I can answer questions from our library of Srila Prabhupada books and provide direct citations for the teachings. Ask me anything to begin our reflection."
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [activeSpeechId, setActiveSpeechId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);

  // Resize listener to auto-close sidebar on smaller screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 1024) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Support check for Web Speech API SpeechRecognition
  const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const isSpeechRecognitionSupported = !!SpeechRecognitionAPI;

  const handleSpeak = (text: string, msgId: string) => {
    if (activeSpeechId === msgId) {
      window.speechSynthesis.cancel();
      setActiveSpeechId(null);
    } else {
      window.speechSynthesis.cancel(); // Stop any ongoing speech
      
      // Clean markdown formatting, inline source tags, and system notices
      let cleanText = text
        .replace(/\*\(System Notice:[^)]+\)\*\s*\n*/g, "") // remove system notices
        .replace(/\[Source\s*#\d+\]/g, "") // remove [Source #N] tags
        .replace(/\*\*([^*]+)\*\*/g, "$1") // remove bold markdown
        .replace(/\*([^*]+)\*/g, "$1") // remove italic markdown
        .replace(/`([^`]+)`/g, "$1") // remove code backticks
        .replace(/#+\s+/g, "") // remove headers
        .trim();
        
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 0.95; // Peaceful, slightly slower rate
      utterance.pitch = 1.0;
      
      utterance.onend = () => {
        setActiveSpeechId(null);
      };
      utterance.onerror = () => {
        setActiveSpeechId(null);
      };
      
      window.speechSynthesis.speak(utterance);
      setActiveSpeechId(msgId);
    }
  };

  const handleMicToggle = () => {
    if (!isSpeechRecognitionSupported) {
      alert("Speech recognition is not supported in this browser. Please try Chrome or Safari.");
      return;
    }

    if (isListening) {
      const recognition = (window as any)._activeRecognition;
      if (recognition) {
        recognition.stop();
      }
      setIsListening(false);
    } else {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = false;
      recognition.lang = "en-US";
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(prev => {
          const separator = prev.trim() ? " " : "";
          return prev + separator + transcript;
        });
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      (window as any)._activeRecognition = recognition;
      recognition.start();
    }
  };
  
  // Database states
  const [books, setBooks] = useState<Book[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [isIngesting, setIsIngesting] = useState(false);
  const [clearOnIngest, setClearOnIngest] = useState(false);
  const [ingestionStatus, setIngestionStatus] = useState<string>("");
  const [ingestionProgress, setIngestionProgress] = useState<{
    book: string;
    current: number;
    total: number;
  } | null>(null);
  const [backendStatus, setBackendStatus] = useState<"online" | "offline" | "mock">("offline");
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Admin auth states
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordError, setAdminPasswordError] = useState("");
  
  // Dynamic settings state
  const [activeSettings, setActiveSettings] = useState({
    llm_provider: "gemini",
    embedding_provider: "gemini",
    llm_model: "gemini-2.5-flash",
    embedding_model: "models/gemini-embedding-2",
    ollama_host: "http://localhost:11434",
    ollama_model: "gemma3:4b",
    ollama_embedding_model: "nomic-embed-text",
    gemini_api_key_masked: "",
    is_mock_mode: true
  });

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings`);
      if (res.ok) {
        const data = await res.json();
        setActiveSettings(data);
      }
    } catch (e) {
      console.error("Error fetching settings:", e);
    }
  };

  const handleVerifyAdmin = async () => {
    if (!adminPassword) {
      setAdminPasswordError("Password cannot be empty.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/admin/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword })
      });
      if (res.ok) {
        localStorage.setItem("antarjyoti_admin_password", adminPassword);
        setIsAdmin(true);
        setIsAdminModalOpen(false);
        setAdminPassword("");
        setAdminPasswordError("");
        fetchSettings(); // Refresh settings
        fetchBooksList(); // Refresh books
      } else {
        const err = await res.json();
        setAdminPasswordError(err.detail || "Authentication failed.");
      }
    } catch (e) {
      setAdminPasswordError("Failed to connect to API.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("antarjyoti_admin_password");
    setIsAdmin(false);
  };

  const handleUpdateSetting = async (key: string, value: string) => {
    try {
      // Optimistic state update
      setActiveSettings(prev => ({ ...prev, [key]: value }));
      
      const payload = { [key]: value };
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        setActiveSettings(data.settings);
        if (key === "embedding_provider") {
          setTimeout(() => {
            fetchBooksList();
          }, 300);
        }
      } else {
        const err = await res.json();
        alert(`Failed to update setting: ${err.detail || res.statusText}`);
        fetchSettings();
      }
    } catch (e) {
      alert("Error updating settings");
      fetchSettings();
    }
  };

  // Check login on load
  useEffect(() => {
    const saved = localStorage.getItem("antarjyoti_admin_password");
    if (saved) {
      setIsAdmin(true);
    }
  }, []);

  // Initialize and health-check loop
  useEffect(() => {
    const initialize = async () => {
      try {
        const healthRes = await fetch(`${API_BASE}/api/health`);
        if (healthRes.ok) {
          const booksRes = await fetch(`${API_BASE}/api/books`);
          if (booksRes.ok) {
            const data = await booksRes.json();
            setBooks(data.books || []);
            setTotalChunks(data.total_chunks || 0);
            setBackendStatus("online");
            fetchSettings();
          }
        }
      } catch (err) {
        console.error("Backend offline.", err);
        setBackendStatus("offline");
      }
    };
    
    initialize();
    
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/health`);
        if (res.ok) {
          if (backendStatus === "offline") {
            setBackendStatus("online");
            fetchSettings();
            fetchBooksList();
          }
        } else {
          setBackendStatus("offline");
        }
      } catch {
        setBackendStatus("offline");
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [backendStatus]);

  // Citations modal & scroll references
  const [activeCitation, setActiveCitation] = useState<Source | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatHistoryRef = useRef<HTMLDivElement>(null);

  // Smart scroll effect
  useEffect(() => {
    if (shouldAutoScroll) {
      chatEndRef.current?.scrollIntoView({ behavior: isLoading ? "auto" : "smooth" });
    }
  }, [messages, shouldAutoScroll, isLoading]);

  const handleScroll = () => {
    const container = chatHistoryRef.current;
    if (!container) return;
    
    // Check if user is scrolled within 30px of the bottom (tighter threshold for smart-scroll lock)
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 30;
    setShouldAutoScroll(isNearBottom);
  };

  const fetchBooksList = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/books`);
      if (res.ok) {
        const data = await res.json();
        setBooks(data.books || []);
        setTotalChunks(data.total_chunks || 0);
      }
    } catch (e) {
      console.error("Error fetching books:", e);
    }
  };

  const handleIngest = async () => {
    setIsIngesting(true);
    setIngestionStatus("Initializing...");
    setIngestionProgress(null);
    try {
      const response = await fetch(`${API_BASE}/api/ingest?clear=${clearOnIngest}`, { method: "POST" });
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      if (!response.body) {
        throw new Error("No response body received");
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        
        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine || !cleanLine.startsWith("data: ")) continue;
          
          try {
            const jsonStr = cleanLine.substring(6);
            const payload = JSON.parse(jsonStr);
            
            if (payload.type === "info") {
              setIngestionStatus(payload.message);
            } else if (payload.type === "skip") {
              setIngestionStatus(`Skipped: ${payload.book}`);
            } else if (payload.type === "parsing") {
              setIngestionStatus(`Parsing ${payload.file}...`);
            } else if (payload.type === "parsed") {
              setIngestionStatus(`Parsed ${payload.book} (${payload.chunks} chunks)`);
              setIngestionProgress({
                book: payload.book,
                current: 0,
                total: payload.chunks
              });
            } else if (payload.type === "progress") {
              setIngestionStatus(`Ingesting ${payload.book}...`);
              setIngestionProgress({
                book: payload.book,
                current: payload.current,
                total: payload.total
              });
            } else if (payload.type === "success") {
              setIngestionStatus(`Completed: ${payload.book}`);
            } else if (payload.type === "warning") {
              setIngestionStatus(`Warning: ${payload.message}`);
            } else if (payload.type === "error") {
              setIngestionStatus(`Error: ${payload.message}`);
            } else if (payload.type === "done") {
              setIngestionStatus("Finished!");
              setIngestionProgress(null);
              await fetchBooksList();
            }
          } catch (e) {
            console.error("Error parsing ingestion stream chunk:", e);
          }
        }
      }
    } catch (err) {
      alert(`Connection error during ingestion: ${err}`);
      setIngestionStatus("Connection failed");
    } finally {
      setIsIngesting(false);
    }
  };

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;
    
    // Stop any active speech readout
    window.speechSynthesis.cancel();
    setActiveSpeechId(null);
    
    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now()}`;
    
    const newMessages: Message[] = [
      ...messages,
      { id: userMsgId, role: "user", content: textToSend }
    ];
    
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    setShouldAutoScroll(true);
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
    
    // Pre-create the assistant message in history
    setMessages(prev => [
      ...prev,
      { id: assistantMsgId, role: "assistant", content: "", sources: [] }
    ]);
    
    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content }))
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body received");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // SSE streams split messages by double newlines
        const lines = buffer.split("\n\n");
        // Keep the last partial line in the buffer
        buffer = lines.pop() || "";
        
        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine || !cleanLine.startsWith("data: ")) continue;
          
          try {
            const jsonStr = cleanLine.substring(6); // remove 'data: '
            const payload = JSON.parse(jsonStr);
            
            if (payload.type === "sources") {
              // Update the assistant message sources
              setMessages(prev => 
                prev.map(m => 
                  m.id === assistantMsgId 
                    ? { ...m, sources: payload.sources }
                    : m
                )
              );
            } else if (payload.type === "token") {
              // Append token text
              setMessages(prev => 
                prev.map(m => 
                  m.id === assistantMsgId 
                    ? { ...m, content: m.content + payload.text }
                    : m
                )
              );
            } else if (payload.type === "done") {
              // Streaming complete
              setIsLoading(false);
            } else if (payload.type === "error") {
              // Stream error
              setMessages(prev => 
                prev.map(m => 
                  m.id === assistantMsgId 
                    ? { ...m, content: m.content + `\n\n*(Error: ${payload.message})*` }
                    : m
                )
              );
              setIsLoading(false);
            }
          } catch (e) {
            console.error("Error parsing stream chunk:", e);
          }
        }
      }
    } catch (error) {
      console.error("Fetch error:", error);
      setMessages(prev => 
        prev.map(m => 
          m.id === assistantMsgId 
            ? { 
                ...m, 
                content: "Deep apologies, Seeker. I am unable to query my inner database at this moment. Please ensure the backend server is running." 
              }
            : m
        )
      );
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(input);
  };

  const formatMessageText = (text: string, sources: Source[] = []) => {
    const paragraphs = text.split("\n");
    
    return paragraphs.map((para, pIdx) => {
      if (!para.trim()) return null;
      
      // Parse tags like [Source #1]
      const parts = para.split(/(\[Source #\d+\])/g);
      
      return (
        <p key={pIdx} style={{ marginBottom: pIdx < paragraphs.length - 1 ? "12px" : "0" }}>
          {parts.map((part, index) => {
            const match = part.match(/\[Source #(\d+)\]/);
            if (match) {
              const num = parseInt(match[1], 10);
              const sourceIdx = num - 1;
              const source = sources?.[sourceIdx];
              return (
                <span
                  key={index}
                  className="citation-tag"
                  onClick={() => {
                    if (source) {
                      setActiveCitation(source);
                    }
                  }}
                  title={source ? `${source.metadata.book} Ch ${source.metadata.chapter}` : `Source #${num}`}
                >
                  Source #{num}
                </span>
              );
            }
            
            // Format bold tags **text**
            const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
            return boldParts.map((bp, bpIdx) => {
              if (bp.startsWith("**") && bp.endsWith("**")) {
                return <strong key={bpIdx} style={{ color: "var(--accent-gold)" }}>{bp.slice(2, -2)}</strong>;
              }
              return bp;
            });
          })}
        </p>
      );
    });
  };

  return (
    <div className="app-container">
      {/* Dynamic Header */}
      <header className="app-header glass-panel">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button 
            className="sidebar-toggle-btn"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: "1.3rem",
              padding: "4px 8px",
              display: "flex",
              alignItems: "center",
              borderRadius: "6px",
              transition: "var(--transition-smooth)"
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "var(--accent-gold)"}
            onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-secondary)"}
          >
            ☰
          </button>
          
          <div className="app-title-container">
            <div className="app-logo">✦</div>
            <div className="app-title">
              <h1>AntarJyoti</h1>
              <div className="app-subtitle">Spiritual Wisdom Assistant</div>
            </div>
          </div>
        </div>
        
        <div className="header-controls" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div className="connection-status">
            <div className={`status-dot ${
              backendStatus === "online" 
                ? (totalChunks > 0 ? "status-active" : "status-mock") 
                : "status-inactive"
            }`} />
            <span className="connection-status-text">
              {backendStatus === "online" 
                ? (totalChunks > 0 ? "System Active" : "Offline Mode") 
                : "Server Offline"}
            </span>
          </div>
        </div>
      </header>

      {/* Main Layout wrapper */}
      <main className={`main-layout ${isSidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}>
        
        {/* Mobile sidebar backdrop overlay */}
        {isSidebarOpen && (
          <div className="sidebar-backdrop" onClick={() => setIsSidebarOpen(false)} />
        )}

        {/* Sidebar Panel */}
        <aside className="sidebar glass-panel">
          <div>
            <h2 className="sidebar-section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span>📖</span> Library Books
              </span>
              {books.length > 0 && (
                <span className="book-badge-count" style={{ fontSize: "0.75rem", background: "var(--accent-gold-dark)", color: "var(--text-primary)" }}>
                  {books.length} {books.length === 1 ? "book" : "books"}
                </span>
              )}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {books.length === 0 ? (
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontStyle: "italic", padding: "10px" }}>
                  No books indexed yet. Put PDFs/TXTs in the /books directory and click "Index Books".
                </div>
              ) : (
                [...books]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((b, idx) => (
                    <div key={idx} className="book-badge">
                      <span style={{ display: "flex", alignItems: "center" }}>
                        <span className="book-badge-icon">📜</span>
                        <span style={{ fontWeight: 500 }}>{b.name}</span>
                      </span>
                      <span className="book-badge-count">{b.chunk_count} pgs</span>
                    </div>
                  ))
              )}
            </div>
          </div>

          <div style={{ marginTop: "16px", borderTop: "1px solid var(--border-light)", paddingTop: "16px" }}>
            {isAdmin ? (
              <>
                <h2 className="sidebar-section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>⚙️</span> Admin Settings
                  </span>
                  <button 
                    onClick={handleLogout}
                    style={{ background: "transparent", border: "none", color: "var(--accent-terracotta)", cursor: "pointer", fontSize: "0.75rem", textDecoration: "underline" }}
                  >
                    Logout
                  </button>
                </h2>
                
                {/* Dynamic Configuration Panel */}
                <div className="control-card" style={{ background: "hsla(24, 10%, 12%, 0.4)", borderRadius: "8px", border: "1px solid var(--border-light)", display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px", padding: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>LLM Provider</label>
                    <select 
                      value={activeSettings.llm_provider} 
                      onChange={(e) => handleUpdateSetting("llm_provider", e.target.value)}
                      disabled={backendStatus === "offline"}
                      style={{ width: "100%", padding: "6px", background: "var(--bg-deep)", color: "var(--text-primary)", border: "1px solid var(--border-light)", borderRadius: "4px", fontSize: "0.8rem", cursor: "pointer" }}
                    >
                      <option value="gemini">Google Gemini</option>
                      <option value="ollama">Local Ollama</option>
                    </select>
                  </div>
                  
                  <div>
                    <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>Embedding Provider</label>
                    <select 
                      value={activeSettings.embedding_provider} 
                      onChange={(e) => handleUpdateSetting("embedding_provider", e.target.value)}
                      disabled={backendStatus === "offline"}
                      style={{ width: "100%", padding: "6px", background: "var(--bg-deep)", color: "var(--text-primary)", border: "1px solid var(--border-light)", borderRadius: "4px", fontSize: "0.8rem", cursor: "pointer" }}
                    >
                      <option value="gemini">Google Gemini (3072d)</option>
                      <option value="ollama">Local Ollama (768d)</option>
                    </select>
                    <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", display: "block", marginTop: "4px" }}>
                      * Database adjusts its directory dynamically depending on provider.
                    </span>
                  </div>

                  {activeSettings.llm_provider === "ollama" && (
                    <div>
                      <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>Ollama LLM Model</label>
                      <input 
                        type="text" 
                        value={activeSettings.ollama_model}
                        onChange={(e) => {
                          const val = e.target.value;
                          setActiveSettings(prev => ({ ...prev, ollama_model: val }));
                        }}
                        onBlur={() => handleUpdateSetting("ollama_model", activeSettings.ollama_model)}
                        style={{ width: "100%", padding: "6px", background: "var(--bg-deep)", color: "var(--text-primary)", border: "1px solid var(--border-light)", borderRadius: "4px", fontSize: "0.8rem" }}
                      />
                    </div>
                  )}

                  {activeSettings.embedding_provider === "ollama" && (
                    <div>
                      <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>Ollama Embedding Model</label>
                      <input 
                        type="text" 
                        value={activeSettings.ollama_embedding_model}
                        onChange={(e) => {
                          const val = e.target.value;
                          setActiveSettings(prev => ({ ...prev, ollama_embedding_model: val }));
                        }}
                        onBlur={() => handleUpdateSetting("ollama_embedding_model", activeSettings.ollama_embedding_model)}
                        style={{ width: "100%", padding: "6px", background: "var(--bg-deep)", color: "var(--text-primary)", border: "1px solid var(--border-light)", borderRadius: "4px", fontSize: "0.8rem" }}
                      />
                    </div>
                  )}
                </div>

                {/* Ingestion Panel */}
                <h2 className="sidebar-section-title">
                  <span>⚙️</span> Ingestion Controls
                </h2>
                <div className="control-card" style={{ background: "hsla(24, 10%, 12%, 0.4)", borderRadius: "8px", border: "1px solid var(--border-light)", padding: "12px" }}>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    Reads raw books in <code>gita/books/</code> directory and builds the vector search database.
                  </p>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8rem", color: "var(--text-secondary)", cursor: "pointer", userSelect: "none", margin: "4px 0" }}>
                    <input 
                      type="checkbox" 
                      checked={clearOnIngest} 
                      onChange={(e) => setClearOnIngest(e.target.checked)} 
                      disabled={isIngesting || backendStatus === "offline"}
                      style={{ accentColor: "var(--accent-gold)", width: "16px", height: "16px", cursor: "pointer" }}
                    />
                    Clear database before indexing
                  </label>
                  <button 
                    className="btn btn-primary" 
                    onClick={handleIngest} 
                    disabled={isIngesting || backendStatus === "offline"}
                    style={{ width: "100%" }}
                  >
                    {isIngesting ? (
                      <>
                        <div className="spinner" /> Indexing...
                      </>
                    ) : (
                      "Index / Reload Books"
                    )}
                  </button>

                  {isIngesting && (
                    <div style={{ marginTop: "12px", borderTop: "1px solid var(--border-light)", paddingTop: "12px" }}>
                      <div style={{ fontSize: "0.8rem", color: "var(--accent-gold)", fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
                        <span>Status:</span>
                        <span style={{ color: "var(--text-primary)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", maxWidth: "150px" }} title={ingestionStatus}>
                          {ingestionStatus}
                        </span>
                      </div>
                      
                      {ingestionProgress && (
                        <div style={{ marginTop: "8px" }}>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "4px", display: "flex", justifyContent: "space-between" }}>
                            <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", maxWidth: "120px" }} title={ingestionProgress.book}>
                              {ingestionProgress.book}
                            </span>
                            <span>
                              {ingestionProgress.current} / {ingestionProgress.total} chunks
                            </span>
                          </div>
                          <div className="progress-bar-container" style={{ width: "100%", height: "6px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" }}>
                            <div 
                              className="progress-bar-fill" 
                              style={{ 
                                width: `${(ingestionProgress.current / ingestionProgress.total) * 100}%`, 
                                height: "100%", 
                                background: "linear-gradient(90deg, var(--accent-gold), #ffd700)",
                                transition: "width 0.2s ease-in-out"
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ padding: "8px", textAlign: "center" }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setIsAdminModalOpen(true)}
                  style={{ width: "100%", gap: "8px" }}
                >
                  🔒 Admin Panel Login
                </button>
              </div>
            )}
          </div>

          <div className="connection-status" style={{ marginTop: "auto", fontSize: "0.75rem", color: "var(--text-muted)", flexDirection: "column", alignItems: "flex-start", gap: "4px" }}>
            <div>Database Chunks: <strong>{totalChunks}</strong></div>
            <div>Server endpoint: <code>{API_BASE}</code></div>
          </div>
        </aside>

        {/* Chat Interface Container */}
        <section className="chat-container glass-panel">
          <div className="chat-history" ref={chatHistoryRef} onScroll={handleScroll}>
            <div className="chat-history-inner">
              {messages.map((msg) => (
                <div key={msg.id} className={`message ${msg.role === "user" ? "message-user" : "message-assistant"}`}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                    <div className={`avatar ${msg.role === "user" ? "avatar-user" : "avatar-assistant"}`}>
                      {msg.role === "user" ? "👤" : "🕉️"}
                    </div>
                    {msg.role === "assistant" && msg.content !== "" && (
                      <button
                        className="speak-btn"
                        onClick={() => handleSpeak(msg.content, msg.id)}
                        title={activeSpeechId === msg.id ? "Stop Reading" : "Read Aloud"}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: activeSpeechId === msg.id ? "var(--accent-terracotta)" : "var(--text-muted)",
                          cursor: "pointer",
                          fontSize: "1.1rem",
                          transition: "var(--transition-smooth)",
                          padding: "4px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        onMouseEnter={(e) => {
                          if (activeSpeechId !== msg.id) e.currentTarget.style.color = "var(--accent-gold)";
                        }}
                        onMouseLeave={(e) => {
                          if (activeSpeechId !== msg.id) e.currentTarget.style.color = "var(--text-muted)";
                        }}
                      >
                        {activeSpeechId === msg.id ? "⏹️" : "🔊"}
                      </button>
                    )}
                  </div>
                  <div className="message-bubble">
                    <div className="message-text">
                      {msg.content === "" ? (
                        <div className="typing-indicator">
                          <div className="typing-dot"></div>
                          <div className="typing-dot"></div>
                          <div className="typing-dot"></div>
                        </div>
                      ) : (
                        formatMessageText(msg.content, msg.sources)
                      )}
                    </div>
                    
                    {/* Sources Preview (Assistant response only) */}
                    {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                      <div className="sources-panel" style={{ marginTop: "12px", borderTop: "none" }}>
                        <button
                          type="button"
                          onClick={() => setExpandedSources(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--accent-gold)",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            letterSpacing: "0.05em",
                            textTransform: "uppercase",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "4px 0",
                            userSelect: "none"
                          }}
                        >
                          <span style={{ fontSize: "0.6rem", transition: "transform 0.2s", transform: expandedSources[msg.id] ? "rotate(90deg)" : "rotate(0deg)" }}>
                            ▶
                          </span>
                          References used ({msg.sources.length})
                        </button>
                        
                        {expandedSources[msg.id] && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px", animation: "fadeIn 0.25s ease" }}>
                            {msg.sources.map((src, sIdx) => {
                              const verseText = src.metadata.verse ? `v. ${src.metadata.verse}` : `p. ${src.metadata.page || "N/A"}`;
                              return (
                                <div 
                                  key={src.id} 
                                  className="source-item" 
                                  style={{ padding: "6px 10px", cursor: "pointer", display: "flex", gap: "6px", alignItems: "center" }}
                                  onClick={() => setActiveCitation(src)}
                                >
                                  <span className="source-num">{sIdx + 1}</span>
                                  <span style={{ fontSize: "0.75rem" }}>
                                    <strong>{src.metadata.book}</strong> ({verseText})
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Prompt input field */}
          <div className="chat-input-container">
            <div className="chat-input-inner">
              <form onSubmit={handleSubmit} className="chat-form">
                <input
                  type="text"
                  className="chat-input"
                  placeholder={isListening ? "Listening... Speak now." : (isLoading ? "Generating spiritual reflection..." : "Ask the sacred books, e.g. What is the path of devotion?")}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isLoading}
                  id="chat-input-field"
                  style={{ paddingRight: "100px" }}
                />
                
                {isSpeechRecognitionSupported && !isLoading && (
                  <button
                    type="button"
                    onClick={handleMicToggle}
                    className="mic-button"
                    title={isListening ? "Stop listening" : "Dictate question"}
                    style={{
                      position: "absolute",
                      right: "58px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: "40px",
                      height: "40px",
                      borderRadius: "8px",
                      background: isListening 
                        ? "linear-gradient(135deg, var(--accent-terracotta), hsl(12, 60%, 45%))" 
                        : "hsla(36, 10%, 20%, 0.4)",
                      border: isListening ? "1px solid var(--accent-terracotta)" : "1px solid var(--border-light)",
                      color: isListening ? "var(--text-primary)" : "var(--text-secondary)",
                      fontSize: "1.1rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "var(--transition-smooth)",
                      animation: isListening ? "pulseGlowRed 1.5s infinite alternate" : "none"
                    }}
                    onMouseEnter={(e) => {
                      if (!isListening) e.currentTarget.style.color = "var(--accent-gold)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isListening) e.currentTarget.style.color = "var(--text-secondary)";
                    }}
                  >
                    {isListening ? "⏹️" : "🎙️"}
                  </button>
                )}

                <button 
                  type="submit" 
                  className="send-button"
                  disabled={isLoading || !input.trim()}
                  id="chat-send-btn"
                >
                  {isLoading ? "⏳" : "➔"}
                </button>
              </form>
              
              {/* Preconfigured Questions */}
              {messages.length === 1 && !isLoading && (
                <div style={{ marginTop: "16px", textAlign: "left" }}>
                  <button
                    type="button"
                    onClick={() => setShowSuggestions(!showSuggestions)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--accent-gold)",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "4px 0",
                      userSelect: "none"
                    }}
                  >
                    <span style={{ fontSize: "0.6rem", transition: "transform 0.2s", transform: showSuggestions ? "rotate(90deg)" : "rotate(0deg)" }}>
                      ▶
                    </span>
                    Suggested Contemplations
                  </button>
                  
                  {showSuggestions && (
                    <div className="suggestions-grid" style={{ animation: "fadeIn 0.25s ease", marginTop: "8px" }}>
                      {SUGGESTIONS.map((s, idx) => (
                        <button
                          key={idx}
                          className="suggestion-card"
                          onClick={() => handleSendMessage(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

      </main>

      {/* Citation Expandable Modal */}
      {activeCitation && (
        <div className="modal-overlay" onClick={() => setActiveCitation(null)}>
          <div className="modal-content glass-panel glass-panel-glow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ color: "var(--accent-gold)", fontSize: "1.1rem" }}>
                📜 Reference Passage
              </h3>
              <button className="modal-close" onClick={() => setActiveCitation(null)}>
                &times;
              </button>
            </div>
            
            <div style={{ background: "hsla(0, 0%, 0%, 0.3)", padding: "16px", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
              <div className="source-header" style={{ marginBottom: "12px", fontSize: "0.95rem" }}>
                <span>📖</span>
                <span>
                  <strong>{activeCitation.metadata.book}</strong>
                  {activeCitation.metadata.chapter !== "N/A" && ` — Chapter ${activeCitation.metadata.chapter}`}
                  {activeCitation.metadata.verse && `, Verse ${activeCitation.metadata.verse}`}
                  {activeCitation.metadata.page && `, Page ${activeCitation.metadata.page}`}
                </span>
              </div>
              
              <div style={{ fontSize: "0.95rem", lineHeight: 1.7, fontStyle: "italic", borderLeft: "3px solid var(--accent-gold)", paddingLeft: "12px", color: "var(--text-primary)" }}>
                "{activeCitation.text}"
              </div>
            </div>
            
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
              <button className="btn btn-secondary" onClick={() => setActiveCitation(null)}>
                Close Reflection
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Admin Login Modal */}
      {isAdminModalOpen && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(5px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}>
          <div className="glass-panel" style={{
            width: "350px",
            padding: "24px",
            borderRadius: "12px",
            border: "1px solid var(--border-light)",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.37)"
          }}>
            <h3 style={{ margin: 0, color: "var(--accent-gold)", textAlign: "center", fontSize: "1.2rem" }}>
              🔒 Administrator Login
            </h3>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", textAlign: "center" }}>
              Enter password to unlock system configuration and document ingestion controls.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <input
                type="password"
                placeholder="Enter password..."
                value={adminPassword}
                onChange={(e) => {
                  setAdminPassword(e.target.value);
                  setAdminPasswordError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleVerifyAdmin();
                }}
                style={{
                  width: "100%",
                  padding: "10px",
                  background: "var(--bg-deep)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-light)",
                  borderRadius: "6px",
                  fontSize: "0.9rem",
                  outline: "none"
                }}
                autoFocus
              />
              {adminPasswordError && (
                <span style={{ fontSize: "0.75rem", color: "var(--accent-terracotta)" }}>
                  ⚠️ {adminPasswordError}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => {
                  setIsAdminModalOpen(false);
                  setAdminPassword("");
                  setAdminPasswordError("");
                }}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleVerifyAdmin}
                style={{ flex: 1 }}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export type {}
