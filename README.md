# ✨ Gemini Chatbot

A minimal full-stack chatbot powered by **Google Gemini 1.5 Flash** — featuring multi-turn conversation, PDF/TXT document Q&A, image understanding, and multiple chat sessions.

```
┌─────────────────────────────────────────────────────┐
│  Sidebar (chat list)  │       Chat Window            │
│  ─────────────────    │  ───────────────────────     │
│  + New Chat           │  [messages appear here]      │
│                       │                              │
│  💬 Summarize notes   │  ─────────────────────────   │
│  💬 Image Q&A         │  📄🖼️  [type here...]  ➤    │
└─────────────────────────────────────────────────────┘
```

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 18.x |
| npm | 9.x |

---

## 1 · Get a Gemini API Key

1. Open [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click **Create API key**
3. Copy the key — you'll need it in the next step

---

## 2 · Set the API Key

### Option A — `.env` file (recommended)

```bash
cd backend
cp .env.example .env
# Open .env and replace the placeholder:
# GEMINI_API_KEY=your_actual_key_here
```

### Option B — Shell environment variable

```bash
# macOS / Linux
export GEMINI_API_KEY=your_actual_key_here

# Windows Command Prompt
set GEMINI_API_KEY=your_actual_key_here

# Windows PowerShell
$env:GEMINI_API_KEY="your_actual_key_here"
```

---

## 3 · Install Dependencies

Open **two terminals**.

### Terminal 1 — Backend

```bash
cd backend
npm install
```

### Terminal 2 — Frontend

```bash
cd frontend
npm install
```

---

## 4 · Run the App

### Terminal 1 — Start backend

```bash
cd backend
npm start
# ✅  Backend running → http://localhost:3001
```

> For auto-restart on code changes use `npm run dev` (requires nodemon, included as devDependency).

### Terminal 2 — Start frontend

```bash
cd frontend
npm run dev
# ✅  Frontend running → http://localhost:5173
```

Open **http://localhost:5173** in your browser.

---

## 5 · Project Structure

```
gemini-chatbot/
├── backend/
│   ├── server.js          # Express API + Gemini integration
│   ├── package.json
│   └── .env.example       # Copy to .env and add your key
│
├── frontend/
│   ├── index.html
│   ├── vite.config.js     # Dev proxy → localhost:3001
│   ├── package.json
│   └── src/
│       ├── main.jsx       # React entry point
│       ├── App.jsx        # Full UI + state management
│       └── App.css        # Dark-theme styles
│
└── README.md
```

---

## 6 · API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/chats` | List all chat sessions |
| `POST` | `/api/chats` | Create a new chat |
| `GET` | `/api/chats/:id` | Get a chat (messages + metadata) |
| `POST` | `/api/chats/:id/upload` | Upload PDF, TXT, PNG, or JPG |
| `POST` | `/api/chats/:id/message` | Send a message, get AI response |

---

## 7 · Example Usage

### Example 1 — Document Q&A

1. Click **+ New Chat**
2. Click the 📄 button → select `notes.pdf`
3. Wait for the upload toast: *"Document uploaded (12.3k chars)"*
4. Type: **"Summarize the document"** → Gemini returns a summary
5. Type: **"What was the third point?"** → Gemini uses both document + conversation context

### Example 2 — Image Q&A

1. Click **+ New Chat**
2. Click the 🖼️ button → select `photo.jpg`
3. An image thumbnail appears above the input
4. Type: **"What's in the image?"** → Gemini describes it
5. Type: **"Is the person smiling?"** → Gemini answers using the same image

### Example 3 — Context Reset

1. In an existing chat with an uploaded file, ask: **"What did I upload?"**
2. Gemini describes the file
3. Click **+ New Chat**
4. Ask: **"What did I upload?"**
5. Gemini responds: *"No files have been uploaded in this conversation."*

---

## 8 · Features at a Glance

| Feature | Detail |
|---------|--------|
| **Conversations** | Multi-turn with full history per session |
| **Document support** | PDF (via `pdf-parse`) and plain TXT files |
| **Image support** | PNG and JPG sent as Gemini inline data |
| **Multiple chats** | Listed in sidebar, switchable without data leakage |
| **New Chat / Reset** | Clears messages, document text, and image |
| **Markdown rendering** | Bot replies rendered with `react-markdown` |
| **Loading indicators** | Animated typing dots + spinner icons |
| **Image preview** | Thumbnail shown in input area before sending |
| **State persistence** | In-memory only — resets on server restart |

---

## 9 · Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | *(required)* | Your Google AI Studio key |
| `PORT` | `3001` | Backend listen port |

---

## 10 · Notes & Limitations

- **No database** — all state is in-memory; a server restart wipes all chats.
- **File size limit** — 20 MB per upload (configurable in `server.js`).
- **Document length** — first 60 000 characters are sent to Gemini; longer docs are truncated.
- **No auth** — designed for local/demo use only.
- **Image context** — the uploaded image is re-sent with every message in that chat to maintain visual context.
