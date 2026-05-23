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

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// Auto-bypass localtunnel warning page for API calls
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : (input instanceof Request ? input.url : "");
  if (url.includes("loca.lt")) {
    init = init || {};
    const headers = new Headers(init.headers || {});
    headers.set("Bypass-Tunnel-Reminder", "true");
    
    // If input is a Request object, clone it with the new headers
    if (input instanceof Request) {
      return originalFetch(new Request(input, { headers }), init);
    }
    
    init.headers = headers;
  }
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
      content: "Greetings, seeker. I am **AntarJyoti**, your guide. I can answer questions from your library of spiritual books and provide direct citations for the teachings. Ask me anything to begin our reflection."
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Database states
  const [books, setBooks] = useState<Book[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestionStatus, setIngestionStatus] = useState<string>("");
  const [ingestionProgress, setIngestionProgress] = useState<{
    book: string;
    current: number;
    total: number;
  } | null>(null);
  const [backendStatus, setBackendStatus] = useState<"online" | "offline" | "mock">("offline");
  
  // Citations modal
  const [activeCitation, setActiveCitation] = useState<Source | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check backend connection and fetch books list
    const initialize = async () => {
      try {
        const healthRes = await fetch(`${API_BASE}/api/health`);
        if (healthRes.ok) {
          // Check config if mock mode by calling books
          const booksRes = await fetch(`${API_BASE}/api/books`);
          if (booksRes.ok) {
            const data = await booksRes.json();
            setBooks(data.books || []);
            setTotalChunks(data.total_chunks || 0);
            
            // To detect mock mode, check if we get a header or mock response indicator
            setBackendStatus("online");
          }
        }
      } catch (err) {
        console.error("Backend offline. Running with client side state.", err);
        setBackendStatus("offline");
      }
    };
    
    initialize();
    
    // Periodically check health (every 10s)
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/health`);
        if (res.ok) {
          if (backendStatus === "offline") setBackendStatus("online");
        } else {
          setBackendStatus("offline");
        }
      } catch {
        setBackendStatus("offline");
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [backendStatus]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
      const response = await fetch(`${API_BASE}/api/ingest`, { method: "POST" });
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
    
    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now()}`;
    
    const newMessages: Message[] = [
      ...messages,
      { id: userMsgId, role: "user", content: textToSend }
    ];
    
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    
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
        <div className="app-title-container">
          <div className="app-logo">✦</div>
          <div className="app-title">
            <h1>AntarJyoti</h1>
            <div className="app-subtitle">Spiritual Wisdom Assistant</div>
          </div>
        </div>
        
        <div className="connection-status">
          <div className={`status-dot ${
            backendStatus === "online" 
              ? (totalChunks > 0 ? "status-active" : "status-mock") 
              : "status-inactive"
          }`} />
          <span>
            {backendStatus === "online" 
              ? (totalChunks > 0 ? "System Active (RAG)" : "Offline Mode (Mock)") 
              : "Server Offline"}
          </span>
        </div>
      </header>

      {/* Main Grid Layout */}
      <main className="main-layout">
        
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

          <div style={{ marginTop: "16px" }}>
            <h2 className="sidebar-section-title">
              <span>⚙️</span> Ingestion Controls
            </h2>
            <div className="control-card" style={{ background: "hsla(24, 10%, 12%, 0.4)", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
              <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Reads raw books in <code>gita/books/</code> directory and builds the vector search database.
              </p>
              <button 
                className="btn btn-primary" 
                onClick={handleIngest} 
                disabled={isIngesting || backendStatus === "offline"}
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
          </div>

          <div className="connection-status" style={{ marginTop: "auto", fontSize: "0.75rem", color: "var(--text-muted)", flexDirection: "column", alignItems: "flex-start", gap: "4px" }}>
            <div>Database Chunks: <strong>{totalChunks}</strong></div>
            <div>Server endpoint: <code>{API_BASE}</code></div>
          </div>
        </aside>

        {/* Chat Interface Container */}
        <section className="chat-container glass-panel">
          <div className="chat-history">
            {messages.map((msg) => (
              <div key={msg.id} className={`message ${msg.role === "user" ? "message-user" : "message-assistant"}`}>
                <div className={`avatar ${msg.role === "user" ? "avatar-user" : "avatar-assistant"}`}>
                  {msg.role === "user" ? "👤" : "🕉️"}
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
                    <div className="sources-panel">
                      <div style={{ fontSize: "0.75rem", color: "var(--accent-gold)", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                        References used in this answer:
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
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
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Prompt input field */}
          <div className="chat-input-container">
            <form onSubmit={handleSubmit} className="chat-form">
              <input
                type="text"
                className="chat-input"
                placeholder={isLoading ? "Generating spiritual reflection..." : "Ask the sacred books, e.g. What is the path of devotion?"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
                id="chat-input-field"
              />
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
              <div style={{ marginTop: "16px" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Suggested Contemplations:
                </div>
                <div className="suggestions-grid">
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
              </div>
            )}
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
    </div>
  );
}
export type {}
