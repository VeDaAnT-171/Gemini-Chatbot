import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';

const API = '/api';

// ─────────────────────────────────────────────────────────────────────────────
// Small helper components
// ─────────────────────────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="message bot">
      <div className="avatar bot-avatar">✨</div>
      <div className="bubble bot-bubble typing">
        <span /><span /><span />
      </div>
    </div>
  );
}

function Toast({ msg, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return <div className="toast">{msg}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [chats, setChats] = useState([]);             // sidebar list
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Attached-file state (local display only; backend holds the real data)
  const [attachedDoc, setAttachedDoc] = useState(null);    // { name }
  const [attachedImage, setAttachedImage] = useState(null); // { name, previewUrl }

  const [toast, setToast] = useState(null);

  const bottomRef = useRef(null);
  const imageInputRef = useRef(null);
  const docInputRef = useRef(null);
  const textareaRef = useRef(null);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const showToast = (msg) => setToast(msg);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(scrollToBottom, [messages, sending]);

  // ── Load chat list ────────────────────────────────────────────────────────

  const refreshChatList = useCallback(async () => {
    try {
      const res = await fetch(`${API}/chats`);
      const data = await res.json();
      setChats(data);
    } catch {
      showToast('Could not reach the backend.');
    }
  }, []);

  useEffect(() => { refreshChatList(); }, [refreshChatList]);

  // ── New chat ──────────────────────────────────────────────────────────────

  async function handleNewChat() {
    try {
      const res = await fetch(`${API}/chats`, { method: 'POST' });
      const data = await res.json();
      setChats((prev) => [data, ...prev]);
      setActiveChatId(data.id);
      setMessages([]);
      setAttachedDoc(null);
      setAttachedImage(null);
      setInput('');
      textareaRef.current?.focus();
    } catch {
      showToast('Failed to create a new chat.');
    }
  }

  // ── Select existing chat ──────────────────────────────────────────────────

  async function handleSelectChat(chatId) {
    if (chatId === activeChatId) return;
    try {
      const res = await fetch(`${API}/chats/${chatId}`);
      if (!res.ok) { showToast('Could not load chat.'); return; }
      const data = await res.json();
      setActiveChatId(chatId);
      setMessages(data.messages || []);
      setAttachedDoc(data.documentName ? { name: data.documentName } : null);
      setAttachedImage(data.imageName ? { name: data.imageName, previewUrl: null } : null);
      setInput('');
    } catch {
      showToast('Network error loading chat.');
    }
  }

  // ── File upload ───────────────────────────────────────────────────────────

  async function handleFileChange(e, type) {
    const file = e.target.files?.[0];
    e.target.value = '';          // allow re-uploading same file
    if (!file || !activeChatId) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API}/chats/${activeChatId}/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      if (data.type === 'image') {
        const previewUrl = URL.createObjectURL(file);
        setAttachedImage({ name: file.name, previewUrl });
        showToast(`🖼️  Image "${file.name}" attached.`);
      } else {
        setAttachedDoc({ name: file.name });
        showToast(`📄  Document "${file.name}" uploaded (${(data.charCount / 1000).toFixed(1)}k chars).`);
      }
    } catch (err) {
      showToast('Upload error: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  // ── Send message ──────────────────────────────────────────────────────────

  async function handleSend() {
    const text = input.trim();
    if (!text || sending || !activeChatId) return;

    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await fetch(`${API}/chats/${activeChatId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.response, timestamp: new Date().toISOString() },
      ]);

      // Update sidebar title
      setChats((prev) =>
        prev.map((c) => (c.id === activeChatId ? { ...c, title: data.title || c.title } : c))
      );
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ Error: ${err.message}`,
          timestamp: new Date().toISOString(),
          isError: true,
        },
      ]);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  // ── Textarea auto-grow + Enter to send ───────────────────────────────────

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInputChange(e) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }

  // ── Format timestamp ──────────────────────────────────────────────────────

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="app">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand">
            <span className="brand-icon">✨</span>
            <span className="brand-name">Gemini Chat</span>
          </div>
          <button className="new-chat-btn" onClick={handleNewChat}>
            + New Chat
          </button>
        </div>

        <div className="chat-list">
          {chats.length === 0 && (
            <p className="no-chats">No chats yet. Click <strong>+ New Chat</strong>.</p>
          )}
          {chats.map((c) => (
            <button
              key={c.id}
              className={`chat-item ${c.id === activeChatId ? 'active' : ''}`}
              onClick={() => handleSelectChat(c.id)}
            >
              <span className="chat-item-icon">💬</span>
              <span className="chat-item-title">{c.title || 'New Chat'}</span>
              <span className="chat-item-badges">
                {c.hasDocument && <span title="Document attached">📄</span>}
                {c.hasImage && <span title="Image attached">🖼️</span>}
              </span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          Powered by Gemini 1.5 Flash
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────────────────── */}
      <main className="main">
        {!activeChatId ? (
          /* Welcome screen */
          <div className="welcome">
            <div className="welcome-icon">✨</div>
            <h1>Welcome to Gemini Chat</h1>
            <p>Start a new conversation, upload documents, or ask about images.</p>
            <button className="welcome-btn" onClick={handleNewChat}>
              + New Chat
            </button>
            <div className="welcome-features">
              <div className="feature"><span>💬</span><span>Multi-turn conversations</span></div>
              <div className="feature"><span>📄</span><span>PDF & TXT document Q&A</span></div>
              <div className="feature"><span>🖼️</span><span>Image understanding</span></div>
              <div className="feature"><span>🔄</span><span>Multiple chat sessions</span></div>
            </div>
          </div>
        ) : (
          <>
            {/* ── Message list ─────────────────────────────────────── */}
            <div className="messages">
              {messages.length === 0 && (
                <div className="empty-state">
                  <p>Send a message to start chatting.</p>
                  {(attachedDoc || attachedImage) && (
                    <div className="context-info">
                      {attachedDoc && <span className="ctx-badge doc">📄 {attachedDoc.name}</span>}
                      {attachedImage && <span className="ctx-badge img">🖼️ {attachedImage.name}</span>}
                    </div>
                  )}
                </div>
              )}

              {messages.map((msg, idx) => (
                <div key={idx} className={`message ${msg.role === 'user' ? 'user' : 'bot'}`}>
                  <div className={`avatar ${msg.role === 'user' ? 'user-avatar' : 'bot-avatar'}`}>
                    {msg.role === 'user' ? '👤' : '✨'}
                  </div>
                  <div className="msg-right">
                    <div className={`bubble ${msg.role === 'user' ? 'user-bubble' : 'bot-bubble'} ${msg.isError ? 'error-bubble' : ''}`}>
                      {msg.role === 'user' ? (
                        msg.content
                      ) : (
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      )}
                    </div>
                    <div className="msg-time">{fmtTime(msg.timestamp)}</div>
                  </div>
                </div>
              ))}

              {sending && <TypingIndicator />}
              <div ref={bottomRef} />
            </div>

            {/* ── Input area ───────────────────────────────────────── */}
            <div className="input-area">
              {/* Attachment previews */}
              {(attachedDoc || attachedImage) && (
                <div className="attachments">
                  {attachedDoc && (
                    <div className="attach-chip">
                      <span>📄</span>
                      <span className="attach-name">{attachedDoc.name}</span>
                      <button
                        className="attach-remove"
                        title="Remove document"
                        onClick={() => setAttachedDoc(null)}
                      >×</button>
                    </div>
                  )}
                  {attachedImage && (
                    <div className="attach-chip img-chip">
                      {attachedImage.previewUrl && (
                        <img src={attachedImage.previewUrl} alt="preview" className="img-thumb" />
                      )}
                      <span className="attach-name">{attachedImage.name}</span>
                      <button
                        className="attach-remove"
                        title="Remove image"
                        onClick={() => setAttachedImage(null)}
                      >×</button>
                    </div>
                  )}
                </div>
              )}

              <div className="input-row">
                {/* Hidden file inputs */}
                <input
                  type="file"
                  accept=".pdf,.txt"
                  ref={docInputRef}
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileChange(e, 'doc')}
                />
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg"
                  ref={imageInputRef}
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileChange(e, 'image')}
                />

                {/* Upload buttons */}
                <button
                  className="icon-btn"
                  title="Upload PDF or TXT"
                  onClick={() => docInputRef.current?.click()}
                  disabled={uploading || sending}
                >
                  {uploading ? <span className="spin">⏳</span> : '📄'}
                </button>
                <button
                  className="icon-btn"
                  title="Upload PNG or JPG"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploading || sending}
                >
                  {uploading ? <span className="spin">⏳</span> : '🖼️'}
                </button>

                {/* Text input */}
                <textarea
                  ref={textareaRef}
                  className="text-input"
                  placeholder="Type a message… (Shift+Enter for newline)"
                  value={input}
                  rows={1}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  disabled={sending}
                />

                {/* Send button */}
                <button
                  className="send-btn"
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  title="Send message"
                >
                  {sending ? <span className="spin">⏳</span> : '➤'}
                </button>
              </div>

              <p className="hint">
                {uploading && '⏳ Uploading file…'}
                {sending && !uploading && '⏳ Waiting for Gemini…'}
                {!uploading && !sending && 'Enter to send · Shift+Enter for newline'}
              </p>
            </div>
          </>
        )}
      </main>

      {/* Toast */}
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
