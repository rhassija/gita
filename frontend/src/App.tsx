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
  feedback?: number; // 1 for thumbs up, -1 for thumbs down
  latency_ms?: number;
  prompt_question?: string;
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
  "What promise is made to those who worship with undivided devotion?",
];

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hare Krishna! I am **AntarJyoti** — your AI spiritual guide. I can answer questions from our library of **Srila Prabhupada** books and provide direct citations for the teachings. Ask me anything to begin our reflection.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // collapsed by default
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [activeSpeechId, setActiveSpeechId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);

  // Textarea ref for auto-resize
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  // Resize listener to auto-close sidebar on smaller screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 1024) {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Support check for Web Speech API SpeechRecognition
  const SpeechRecognitionAPI =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const isSpeechRecognitionSupported = !!SpeechRecognitionAPI;

  const handleSpeak = (text: string, msgId: string) => {
    if (activeSpeechId === msgId) {
      window.speechSynthesis.cancel();
      setActiveSpeechId(null);
    } else {
      window.speechSynthesis.cancel();

      let cleanText = text
        .replace(/\*\(System Notice:[^)]+\)\*\s*\n*/g, "")
        .replace(/\[Source\s*#\d+\]/g, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/#+\s+/g, "")
        .trim();

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      utterance.onend = () => setActiveSpeechId(null);
      utterance.onerror = () => setActiveSpeechId(null);

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
      if (recognition) recognition.stop();
      setIsListening(false);
    } else {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = false;
      recognition.lang = "en-US";
      recognition.interimResults = false;

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput((prev) => {
          const separator = prev.trim() ? " " : "";
          return prev + separator + transcript;
        });
        setTimeout(autoResizeTextarea, 50);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

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
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackLogs, setFeedbackLogs] = useState<any[]>([]);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

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
    is_mock_mode: true,
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
        body: JSON.stringify({ password: adminPassword }),
      });
      if (res.ok) {
        localStorage.setItem("antarjyoti_admin_password", adminPassword);
        setIsAdmin(true);
        setIsAdminModalOpen(false);
        setAdminPassword("");
        setAdminPasswordError("");
        fetchSettings();
        fetchBooksList();
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
      setActiveSettings((prev) => ({ ...prev, [key]: value }));

      const payload = { [key]: value };
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveSettings(data.settings);
        if (key === "embedding_provider") {
          setTimeout(() => fetchBooksList(), 300);
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
    if (saved) setIsAdmin(true);
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

  // Smart scroll
  useEffect(() => {
    if (shouldAutoScroll) {
      chatEndRef.current?.scrollIntoView({ behavior: isLoading ? "auto" : "smooth" });
    }
  }, [messages, shouldAutoScroll, isLoading]);

  const handleScroll = () => {
    const container = chatHistoryRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 30;
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
      const response = await fetch(`${API_BASE}/api/ingest?clear=${clearOnIngest}`, {
        method: "POST",
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      if (!response.body) throw new Error("No response body received");

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

            if (payload.type === "info") setIngestionStatus(payload.message);
            else if (payload.type === "skip") setIngestionStatus(`Skipped: ${payload.book}`);
            else if (payload.type === "parsing") setIngestionStatus(`Parsing ${payload.file}...`);
            else if (payload.type === "parsed") {
              setIngestionStatus(`Parsed ${payload.book} (${payload.chunks} chunks)`);
              setIngestionProgress({ book: payload.book, current: 0, total: payload.chunks });
            } else if (payload.type === "progress") {
              setIngestionStatus(`Ingesting ${payload.book}...`);
              setIngestionProgress({
                book: payload.book,
                current: payload.current,
                total: payload.total,
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

    window.speechSynthesis.cancel();
    setActiveSpeechId(null);

    const requestStartTime = Date.now();
    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now()}`;

    const newMessages: Message[] = [
      ...messages,
      { id: userMsgId, role: "user", content: textToSend },
    ];

    setMessages(newMessages);
    setInput("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setIsLoading(true);
    setShouldAutoScroll(true);
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);

    // Pre-create assistant message
    setMessages((prev) => [
      ...prev,
      { id: assistantMsgId, role: "assistant", content: "", sources: [] },
    ]);

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      if (!response.body) throw new Error("No response body received");

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

            if (payload.type === "sources") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, sources: payload.sources } : m
                )
              );
            } else if (payload.type === "token") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, content: m.content + payload.text } : m
                )
              );
            } else if (payload.type === "done") {
              const latency = Date.now() - requestStartTime;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, latency_ms: latency, prompt_question: textToSend }
                    : m
                )
              );
              setIsLoading(false);
            } else if (payload.type === "error") {
              const latency = Date.now() - requestStartTime;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        content: m.content + `\n\n*(Error: ${payload.message})*`,
                        latency_ms: latency,
                        prompt_question: textToSend,
                      }
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
      const latency = Date.now() - requestStartTime;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content:
                  "Deep apologies, Seeker. I am unable to query my inner database at this moment. Please ensure the backend server is running.",
                latency_ms: latency,
                prompt_question: textToSend,
              }
            : m
        )
      );
      setIsLoading(false);
    }
  };

  const handleFeedback = async (msgId: string, value: number) => {
    try {
      const msgIndex = messages.findIndex((m) => m.id === msgId);
      if (msgIndex === -1) return;
      const msg = messages[msgIndex];

      const newFeedback = msg.feedback === value ? undefined : value;

      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, feedback: newFeedback } : m))
      );

      if (newFeedback !== undefined) {
        const payload = {
          question: msg.prompt_question || "",
          answer: msg.content,
          sources: msg.sources || [],
          feedback_value: value,
          latency_ms: msg.latency_ms || 0,
        };

        await fetch(`${API_BASE}/api/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
    } catch (e) {
      console.error("Error submitting feedback:", e);
    }
  };

  const fetchFeedbackLogs = async () => {
    setIsLogsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/feedback`);
      if (res.ok) {
        const data = await res.json();
        setFeedbackLogs(data.feedback || []);
      } else {
        console.error("Failed to fetch feedback logs");
      }
    } catch (e) {
      console.error("Error fetching feedback logs:", e);
    } finally {
      setIsLogsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(input);
  };

  // Handle Enter to send, Shift+Enter for newline (Claude-style)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(input);
    }
  };

  // Determine if we're in the welcome / initial state
  const isWelcomeState = messages.length === 1 && messages[0].id === "welcome";

  const formatMessageText = (text: string, sources: Source[] = [], isStreaming = false) => {
    const paragraphs = text.split("\n");

    const result = paragraphs
      .map((para, pIdx) => {
        if (!para.trim()) return null;

        const parts = para.split(/(\[Source #\d+\])/g);

        return (
          <p key={pIdx} style={{ marginBottom: pIdx < paragraphs.length - 1 ? "10px" : "0" }}>
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
                      if (source) setActiveCitation(source);
                    }}
                    title={
                      source
                        ? `${source.metadata.book} Ch ${source.metadata.chapter}`
                        : `Source #${num}`
                    }
                  >
                    Source #{num}
                  </span>
                );
              }

              const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
              return boldParts.map((bp, bpIdx) => {
                if (bp.startsWith("**") && bp.endsWith("**")) {
                  return (
                    <strong key={bpIdx} style={{ color: "var(--gold)", fontWeight: 600 }}>
                      {bp.slice(2, -2)}
                    </strong>
                  );
                }
                return bp;
              });
            })}
          </p>
        );
      })
      .filter(Boolean);

    return (
      <>
        {result}
        {isStreaming && <span className="streaming-cursor" aria-hidden="true" />}
      </>
    );
  };

  return (
    <div className="app-container">
      {/* ── Header ───────────────────────────────── */}
      <header className="app-header glass">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            className="sidebar-toggle-btn"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
            aria-label="Toggle sidebar"
          >
            ☰
          </button>

          <div className="app-title-container">
            <div className="app-logo">
              <img src="/antarjyoti_avatar.png" alt="AntarJyoti" />
            </div>
            <div className="app-title">
              <h1>AntarJyoti</h1>
              <div className="app-subtitle">Sacred AI · Spiritual Wisdom</div>
            </div>
          </div>
        </div>

        <div className="header-controls">
          <div className="connection-status">
            <div
              className={`status-dot ${
                backendStatus === "online"
                  ? totalChunks > 0
                    ? "status-active"
                    : "status-mock"
                  : "status-inactive"
              }`}
            />
            <span className="connection-status-text">
              {backendStatus === "online"
                ? totalChunks > 0
                  ? "System Active"
                  : "Offline Mode"
                : "Server Offline"}
            </span>
          </div>
        </div>
      </header>

      {/* ── Main Layout ──────────────────────────── */}
      <main className={`main-layout ${isSidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}>
        {/* Backdrop (tablet/mobile) */}
        {isSidebarOpen && window.innerWidth <= 1024 && (
          <div className="sidebar-backdrop" onClick={() => setIsSidebarOpen(false)} />
        )}

        {/* ── Sidebar ──────────────────────────── */}
        <aside className="sidebar glass">
          {/* Library */}
          <div>
            <h2
              className="sidebar-section-title"
              style={{ justifyContent: "space-between", width: "100%" }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                <span>📖</span> Library
              </span>
              {books.length > 0 && (
                <span
                  className="book-badge-count"
                  style={{ background: "var(--gold-soft)", color: "var(--gold)" }}
                >
                  {books.length} {books.length === 1 ? "book" : "books"}
                </span>
              )}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
              {books.length === 0 ? (
                <div
                  style={{
                    fontSize: "0.82rem",
                    color: "var(--text-secondary)",
                    fontStyle: "italic",
                    padding: "10px",
                  }}
                >
                  No books indexed yet. Put PDFs/TXTs in the /books directory and click "Index Books".
                </div>
              ) : (
                [...books]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((b, idx) => (
                    <div key={idx} className="book-badge">
                      <span style={{ display: "flex", alignItems: "center" }}>
                        <span className="book-badge-icon">📜</span>
                        <span style={{ fontWeight: 500, fontSize: "0.83rem" }}>{b.name}</span>
                      </span>
                      <span className="book-badge-count">{b.chunk_count} pgs</span>
                    </div>
                  ))
              )}
            </div>
          </div>

          {/* Admin section */}
          <div
            style={{ marginTop: "8px", borderTop: "1px solid var(--border-subtle)", paddingTop: "14px" }}
          >
            {isAdmin ? (
              <>
                <h2
                  className="sidebar-section-title"
                  style={{ justifyContent: "space-between" }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                    <span>⚙️</span> Admin
                  </span>
                  <button
                    onClick={handleLogout}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--red)",
                      cursor: "pointer",
                      fontSize: "0.72rem",
                      textDecoration: "underline",
                    }}
                  >
                    Logout
                  </button>
                </h2>

                {/* Settings */}
                <div className="control-card" style={{ marginBottom: "12px" }}>
                  <div>
                    <label
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--text-secondary)",
                        display: "block",
                        marginBottom: "4px",
                      }}
                    >
                      LLM Provider
                    </label>
                    <select
                      value={activeSettings.llm_provider}
                      onChange={(e) => handleUpdateSetting("llm_provider", e.target.value)}
                      disabled={backendStatus === "offline"}
                    >
                      <option value="gemini">Google Gemini</option>
                      <option value="ollama">Local Ollama</option>
                    </select>
                  </div>

                  <div>
                    <label
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--text-secondary)",
                        display: "block",
                        marginBottom: "4px",
                      }}
                    >
                      Embedding Provider
                    </label>
                    <select
                      value={activeSettings.embedding_provider}
                      onChange={(e) => handleUpdateSetting("embedding_provider", e.target.value)}
                      disabled={backendStatus === "offline"}
                    >
                      <option value="gemini">Google Gemini (3072d)</option>
                      <option value="ollama">Local Ollama (768d)</option>
                    </select>
                    <span
                      style={{
                        fontSize: "0.62rem",
                        color: "var(--text-muted)",
                        display: "block",
                        marginTop: "3px",
                      }}
                    >
                      * Database directory adjusts dynamically per provider.
                    </span>
                  </div>

                  {activeSettings.llm_provider === "ollama" && (
                    <div>
                      <label
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--text-secondary)",
                          display: "block",
                          marginBottom: "4px",
                        }}
                      >
                        Ollama LLM Model
                      </label>
                      <input
                        type="text"
                        value={activeSettings.ollama_model}
                        onChange={(e) => {
                          const val = e.target.value;
                          setActiveSettings((prev) => ({ ...prev, ollama_model: val }));
                        }}
                        onBlur={() =>
                          handleUpdateSetting("ollama_model", activeSettings.ollama_model)
                        }
                      />
                    </div>
                  )}

                  {activeSettings.embedding_provider === "ollama" && (
                    <div>
                      <label
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--text-secondary)",
                          display: "block",
                          marginBottom: "4px",
                        }}
                      >
                        Ollama Embedding Model
                      </label>
                      <input
                        type="text"
                        value={activeSettings.ollama_embedding_model}
                        onChange={(e) => {
                          const val = e.target.value;
                          setActiveSettings((prev) => ({
                            ...prev,
                            ollama_embedding_model: val,
                          }));
                        }}
                        onBlur={() =>
                          handleUpdateSetting(
                            "ollama_embedding_model",
                            activeSettings.ollama_embedding_model
                          )
                        }
                      />
                    </div>
                  )}
                </div>

                {/* Ingestion */}
                <h2 className="sidebar-section-title">
                  <span>⚙️</span> Ingestion
                </h2>
                <div className="control-card">
                  <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    Reads raw books in <code>gita/books/</code> and builds the vector search database.
                  </p>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "0.78rem",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={clearOnIngest}
                      onChange={(e) => setClearOnIngest(e.target.checked)}
                      disabled={isIngesting || backendStatus === "offline"}
                      style={{ accentColor: "var(--violet)", width: "15px", height: "15px" }}
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
                    <div
                      style={{
                        marginTop: "10px",
                        borderTop: "1px solid var(--border-subtle)",
                        paddingTop: "10px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.78rem",
                          color: "var(--gold)",
                          fontWeight: 600,
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span>Status:</span>
                        <span
                          style={{
                            color: "var(--text-primary)",
                            textOverflow: "ellipsis",
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            maxWidth: "140px",
                          }}
                          title={ingestionStatus}
                        >
                          {ingestionStatus}
                        </span>
                      </div>

                      {ingestionProgress && (
                        <div style={{ marginTop: "8px" }}>
                          <div
                            style={{
                              fontSize: "0.72rem",
                              color: "var(--text-secondary)",
                              marginBottom: "4px",
                              display: "flex",
                              justifyContent: "space-between",
                            }}
                          >
                            <span
                              style={{
                                textOverflow: "ellipsis",
                                overflow: "hidden",
                                whiteSpace: "nowrap",
                                maxWidth: "110px",
                              }}
                              title={ingestionProgress.book}
                            >
                              {ingestionProgress.book}
                            </span>
                            <span>
                              {ingestionProgress.current} / {ingestionProgress.total} chunks
                            </span>
                          </div>
                          <div className="progress-bar-container">
                            <div
                              className="progress-bar-fill"
                              style={{
                                width: `${
                                  (ingestionProgress.current / ingestionProgress.total) * 100
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: "12px" }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setIsFeedbackModalOpen(true);
                      fetchFeedbackLogs();
                    }}
                    style={{ width: "100%" }}
                  >
                    📊 View Feedback Logs
                  </button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center" }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setIsAdminModalOpen(true)}
                  style={{ width: "100%" }}
                >
                  🔒 Admin Panel
                </button>
              </div>
            )}
          </div>

          {/* Footer info */}
          <div
            style={{
              marginTop: "auto",
              paddingTop: "12px",
              borderTop: "1px solid var(--border-subtle)",
              fontSize: "0.72rem",
              color: "var(--text-muted)",
              display: "flex",
              flexDirection: "column",
              gap: "3px",
            }}
          >
            <div>
              Chunks indexed: <strong style={{ color: "var(--text-secondary)" }}>{totalChunks}</strong>
            </div>
            <div style={{ wordBreak: "break-all" }}>
              <code style={{ fontSize: "0.65rem" }}>{API_BASE}</code>
            </div>
          </div>
        </aside>

        {/* ── Chat Section ─────────────────────── */}
        <section className="chat-container glass">
          <div className="chat-history" ref={chatHistoryRef} onScroll={handleScroll}>
            <div className="chat-history-inner">

              {/* ── Welcome Hero (only shown on initial load) ── */}
              {isWelcomeState ? (
                <div className="welcome-hero">
                  <div className="welcome-avatar">
                    <img src="/antarjyoti_avatar.png" alt="AntarJyoti" />
                  </div>
                  <h2 className="welcome-title">AntarJyoti</h2>
                  <p className="welcome-subtitle">
                    Your sacred AI guide to Hindu philosophy and Srila Prabhupada's teachings.
                    Ask me anything about the Bhagavad Gita, dharma, karma, and the path to moksha.
                  </p>
                  <div className="suggestion-chips">
                    {SUGGESTIONS.map((s, idx) => (
                      <button
                        key={idx}
                        className="suggestion-chip"
                        onClick={() => handleSendMessage(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* ── Message list ── */
                messages
                  .filter((msg) => !(msg.id === "welcome" && isWelcomeState))
                  .map((msg) => {
                    const isCurrentlyStreaming =
                      isLoading &&
                      msg.role === "assistant" &&
                      msg === messages[messages.length - 1];

                    return (
                      <div
                        key={msg.id}
                        className={`message ${
                          msg.role === "user" ? "message-user" : "message-assistant"
                        }`}
                      >
                        {/* Avatar column */}
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <div
                            className={`avatar ${
                              msg.role === "user" ? "avatar-user" : "avatar-assistant"
                            }`}
                          >
                            {msg.role === "user" ? (
                              "👤"
                            ) : (
                              <img src="/antarjyoti_avatar.png" alt="AntarJyoti" />
                            )}
                          </div>
                          {/* Speak button under assistant avatar */}
                          {msg.role === "assistant" && msg.content !== "" && (
                            <button
                              onClick={() => handleSpeak(msg.content, msg.id)}
                              title={activeSpeechId === msg.id ? "Stop Reading" : "Read Aloud"}
                              style={{
                                background: "transparent",
                                border: "none",
                                color:
                                  activeSpeechId === msg.id
                                    ? "var(--red)"
                                    : "var(--text-muted)",
                                cursor: "pointer",
                                fontSize: "1rem",
                                padding: "3px",
                                transition: "var(--ease)",
                              }}
                              onMouseEnter={(e) => {
                                if (activeSpeechId !== msg.id)
                                  e.currentTarget.style.color = "var(--gold)";
                              }}
                              onMouseLeave={(e) => {
                                if (activeSpeechId !== msg.id)
                                  e.currentTarget.style.color = "var(--text-muted)";
                              }}
                            >
                              {activeSpeechId === msg.id ? "⏹️" : "🔊"}
                            </button>
                          )}
                        </div>

                        {/* Bubble / prose */}
                        <div className="message-bubble">
                          <div className="message-text">
                            {msg.content === "" ? (
                              <div className="typing-indicator">
                                <div className="typing-dot" />
                                <div className="typing-dot" />
                                <div className="typing-dot" />
                              </div>
                            ) : (
                              formatMessageText(
                                msg.content,
                                msg.sources,
                                isCurrentlyStreaming
                              )
                            )}
                          </div>

                          {/* Meta bar — sources & feedback */}
                          {msg.role === "assistant" && (
                            <div className="message-meta-bar">
                              {/* Sources toggle */}
                              {msg.sources && msg.sources.length > 0 ? (
                                <button
                                  className="meta-btn"
                                  onClick={() =>
                                    setExpandedSources((prev) => ({
                                      ...prev,
                                      [msg.id]: !prev[msg.id],
                                    }))
                                  }
                                >
                                  <span
                                    style={{
                                      fontSize: "0.55rem",
                                      transition: "transform 0.2s",
                                      transform: expandedSources[msg.id]
                                        ? "rotate(90deg)"
                                        : "rotate(0deg)",
                                      display: "inline-block",
                                    }}
                                  >
                                    ▶
                                  </span>
                                  References ({msg.sources.length})
                                </button>
                              ) : (
                                <div />
                              )}

                              {/* Feedback */}
                              {msg.id !== "welcome" && (
                                <div className="feedback-group">
                                  {msg.latency_ms && msg.latency_ms > 0 && (
                                    <span className="latency-tag">
                                      {(msg.latency_ms / 1000).toFixed(1)}s
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    className={`feedback-btn ${msg.feedback === 1 ? "active-up" : ""}`}
                                    onClick={() => handleFeedback(msg.id, 1)}
                                    title="Helpful"
                                  >
                                    👍
                                  </button>
                                  <button
                                    type="button"
                                    className={`feedback-btn ${msg.feedback === -1 ? "active-down" : ""}`}
                                    onClick={() => handleFeedback(msg.id, -1)}
                                    title="Not helpful"
                                  >
                                    👎
                                  </button>
                                  {msg.feedback !== undefined && (
                                    <span className="feedback-saved">Saved ✓</span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Expanded sources */}
                          {msg.role === "assistant" &&
                            msg.sources &&
                            msg.sources.length > 0 &&
                            expandedSources[msg.id] && (
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: "6px",
                                  marginTop: "12px",
                                  animation: "fadeIn 0.2s ease",
                                }}
                              >
                                {msg.sources.map((src, sIdx) => {
                                  const verseText = src.metadata.verse
                                    ? `v. ${src.metadata.verse}`
                                    : `p. ${src.metadata.page || "N/A"}`;
                                  return (
                                    <div
                                      key={src.id}
                                      className="source-item"
                                      onClick={() => setActiveCitation(src)}
                                    >
                                      <span className="source-num">{sIdx + 1}</span>
                                      <span style={{ fontSize: "0.78rem" }}>
                                        <strong>{src.metadata.book}</strong> ({verseText})
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                        </div>
                      </div>
                    );
                  })
              )}

              <div ref={chatEndRef} />
            </div>
          </div>

          {/* ── Input bar ─────────────────────── */}
          <div className="chat-input-container">
            <div className="chat-input-inner">
              <form onSubmit={handleSubmit} className="chat-form">
                <textarea
                  ref={textareaRef}
                  className="chat-input"
                  id="chat-input-field"
                  rows={1}
                  placeholder={
                    isListening
                      ? "Listening… Speak now."
                      : isLoading
                      ? "Reflecting…"
                      : "Ask the sacred texts… (Enter to send, Shift+Enter for newline)"
                  }
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    autoResizeTextarea();
                  }}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                />

                {/* Mic button */}
                {isSpeechRecognitionSupported && !isLoading && (
                  <button
                    type="button"
                    onClick={handleMicToggle}
                    className={`mic-button ${isListening ? "listening" : ""}`}
                    title={isListening ? "Stop listening" : "Dictate question"}
                    aria-label="Voice input"
                  >
                    {isListening ? "⏹️" : "🎙️"}
                  </button>
                )}

                {/* Send button */}
                <button
                  type="submit"
                  className="send-button"
                  disabled={isLoading || !input.trim()}
                  id="chat-send-btn"
                  aria-label="Send message"
                >
                  {isLoading ? <div className="spinner" style={{ width: "14px", height: "14px", borderTopColor: "#fff" }} /> : "↑"}
                </button>
              </form>

              <p className="input-hint">
                AntarJyoti answers only spiritual &amp; Hindu teachings · Powered by Gemini
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ── Citation Modal ──────────────────────── */}
      {activeCitation && (
        <div className="modal-overlay" onClick={() => setActiveCitation(null)}>
          <div
            className="modal-content glass glass-glow"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 style={{ color: "var(--gold)", fontSize: "1.05rem", fontFamily: "var(--font-heading)" }}>
                📜 Reference Passage
              </h3>
              <button className="modal-close" onClick={() => setActiveCitation(null)}>
                ×
              </button>
            </div>

            <div
              style={{
                background: "hsla(228, 20%, 8%, 0.5)",
                padding: "16px",
                borderRadius: "10px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "12px",
                  fontSize: "0.9rem",
                  color: "var(--gold)",
                  fontWeight: 600,
                }}
              >
                <span>📖</span>
                <span>
                  <strong>{activeCitation.metadata.book}</strong>
                  {activeCitation.metadata.chapter !== "N/A" &&
                    ` — Chapter ${activeCitation.metadata.chapter}`}
                  {activeCitation.metadata.verse &&
                    `, Verse ${activeCitation.metadata.verse}`}
                  {activeCitation.metadata.page && `, Page ${activeCitation.metadata.page}`}
                </span>
              </div>

              <div
                style={{
                  fontSize: "0.93rem",
                  lineHeight: 1.75,
                  fontStyle: "italic",
                  borderLeft: "3px solid var(--violet)",
                  paddingLeft: "14px",
                  color: "var(--text-primary)",
                }}
              >
                "{activeCitation.text}"
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => setActiveCitation(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Admin Login Modal ───────────────────── */}
      {isAdminModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => {
            setIsAdminModalOpen(false);
            setAdminPassword("");
            setAdminPasswordError("");
          }}
        >
          <div
            className="glass"
            style={{
              width: "340px",
              padding: "28px",
              borderRadius: "18px",
              display: "flex",
              flexDirection: "column",
              gap: "18px",
              animation: "scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                margin: 0,
                color: "var(--gold)",
                textAlign: "center",
                fontSize: "1.15rem",
                fontFamily: "var(--font-heading)",
              }}
            >
              🔒 Administrator Login
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: "0.82rem",
                color: "var(--text-secondary)",
                textAlign: "center",
              }}
            >
              Enter your admin password to unlock system configuration and ingestion controls.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <input
                type="password"
                placeholder="Enter password…"
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
                  padding: "10px 12px",
                  background: "var(--bg-input)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-mid)",
                  borderRadius: "9px",
                  fontSize: "0.9rem",
                  fontFamily: "var(--font-body)",
                  outline: "none",
                }}
                autoFocus
              />
              {adminPasswordError && (
                <span style={{ fontSize: "0.75rem", color: "var(--red)" }}>
                  ⚠️ {adminPasswordError}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
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
              <button className="btn btn-primary" onClick={handleVerifyAdmin} style={{ flex: 1 }}>
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Feedback Logs Modal ─────────────────── */}
      {isFeedbackModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => setIsFeedbackModalOpen(false)}
        >
          <div
            className="glass"
            style={{
              width: "90%",
              maxWidth: "820px",
              maxHeight: "85vh",
              padding: "24px",
              borderRadius: "18px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              overflow: "hidden",
              animation: "scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px solid var(--border-subtle)",
                paddingBottom: "12px",
              }}
            >
              <h3
                style={{ margin: 0, color: "var(--gold)", fontSize: "1.1rem", fontFamily: "var(--font-heading)" }}
              >
                📊 User Feedback Telemetry
              </h3>
              <button
                onClick={() => setIsFeedbackModalOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: "1.4rem",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {/* Stats */}
            {!isLogsLoading && feedbackLogs.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "10px",
                  background: "rgba(255,255,255,0.02)",
                  padding: "14px",
                  borderRadius: "10px",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {[
                  {
                    label: "Total Submissions",
                    value: feedbackLogs.length,
                    color: "var(--text-primary)",
                  },
                  {
                    label: "👍 vs 👎",
                    value: (
                      <>
                        <span style={{ color: "var(--green)" }}>
                          {feedbackLogs.filter((f) => f.feedback_value === 1).length}
                        </span>{" "}
                        /{" "}
                        <span style={{ color: "var(--red)" }}>
                          {feedbackLogs.filter((f) => f.feedback_value === -1).length}
                        </span>
                      </>
                    ),
                    color: undefined,
                  },
                  {
                    label: "Avg Latency",
                    value: `${(
                      feedbackLogs.reduce((a, c) => a + (c.latency_ms || 0), 0) /
                      feedbackLogs.length /
                      1000
                    ).toFixed(2)}s`,
                    color: "var(--text-primary)",
                  },
                ].map((stat, i) => (
                  <div key={i} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                      {stat.label}
                    </div>
                    <div
                      style={{
                        fontSize: "1.25rem",
                        fontWeight: "bold",
                        color: stat.color,
                        marginTop: "3px",
                      }}
                    >
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Logs list */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                paddingRight: "3px",
              }}
            >
              {isLogsLoading ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "150px",
                    gap: "10px",
                    color: "var(--gold)",
                  }}
                >
                  <div className="spinner" /> Loading…
                </div>
              ) : feedbackLogs.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    color: "var(--text-secondary)",
                    fontStyle: "italic",
                    padding: "40px",
                  }}
                >
                  No user feedback logs recorded yet.
                </div>
              ) : (
                feedbackLogs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      background: "hsla(228, 20%, 9%, 0.5)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "10px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      onClick={() =>
                        setExpandedLogId(expandedLogId === log.id ? null : log.id)
                      }
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "11px 16px",
                        cursor: "pointer",
                        background:
                          expandedLogId === log.id
                            ? "hsla(228, 22%, 13%, 0.7)"
                            : "transparent",
                        transition: "background 0.2s",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          minWidth: 0,
                        }}
                      >
                        <span style={{ fontSize: "1rem" }}>
                          {log.feedback_value === 1 ? "👍" : "👎"}
                        </span>
                        <span
                          style={{
                            fontSize: "0.83rem",
                            fontWeight: 500,
                            color: "var(--text-primary)",
                            textOverflow: "ellipsis",
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            maxWidth: "360px",
                          }}
                          title={log.question}
                        >
                          {log.question}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          fontSize: "0.72rem",
                          color: "var(--text-muted)",
                          flexShrink: 0,
                        }}
                      >
                        <span>{(log.latency_ms / 1000).toFixed(1)}s</span>
                        <span>{new Date(log.timestamp).toLocaleDateString()}</span>
                        <span>{expandedLogId === log.id ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    {expandedLogId === log.id && (
                      <div
                        style={{
                          padding: "14px 16px",
                          borderTop: "1px solid var(--border-subtle)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                          background: "hsla(228, 20%, 7%, 0.4)",
                        }}
                      >
                        <div>
                          <strong
                            style={{
                              fontSize: "0.7rem",
                              color: "var(--gold)",
                              textTransform: "uppercase",
                              display: "block",
                              marginBottom: "4px",
                            }}
                          >
                            User Question
                          </strong>
                          <p style={{ fontSize: "0.87rem", color: "var(--text-primary)", margin: 0 }}>
                            {log.question}
                          </p>
                        </div>
                        <div>
                          <strong
                            style={{
                              fontSize: "0.7rem",
                              color: "var(--gold)",
                              textTransform: "uppercase",
                              display: "block",
                              marginBottom: "4px",
                            }}
                          >
                            AI Response
                          </strong>
                          <p
                            style={{
                              fontSize: "0.85rem",
                              color: "var(--text-secondary)",
                              margin: 0,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {log.answer}
                          </p>
                        </div>
                        {log.sources && log.sources.length > 0 && (
                          <div>
                            <strong
                              style={{
                                fontSize: "0.7rem",
                                color: "var(--gold)",
                                textTransform: "uppercase",
                                display: "block",
                                marginBottom: "4px",
                              }}
                            >
                              Citations
                            </strong>
                            <div
                              style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}
                            >
                              {log.sources.map((src: any, sIdx: number) => {
                                const verseText = src.metadata.verse
                                  ? `v. ${src.metadata.verse}`
                                  : `p. ${src.metadata.page || "N/A"}`;
                                return (
                                  <div
                                    key={sIdx}
                                    className="source-item"
                                    style={{ padding: "4px 9px", fontSize: "0.72rem" }}
                                  >
                                    <span
                                      className="source-num"
                                      style={{ width: "14px", height: "14px", fontSize: "0.6rem" }}
                                    >
                                      {sIdx + 1}
                                    </span>
                                    <span>
                                      <strong>{src.metadata.book}</strong> ({verseText})
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                borderTop: "1px solid var(--border-subtle)",
                paddingTop: "12px",
              }}
            >
              <button className="btn btn-secondary" onClick={() => setIsFeedbackModalOpen(false)}>
                Close Logs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export type {};
