require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdfParse = require('pdf-parse');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ─── Multer (in-memory storage, 20MB limit) ────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ─── Gemini client ─────────────────────────────────────────────────────────
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('❌  GEMINI_API_KEY is not set. Create a .env file or export the variable.');
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(API_KEY);

// ─── In-memory chat store ──────────────────────────────────────────────────
// Structure per chat:
// {
//   id: string,
//   title: string,
//   createdAt: ISO string,
//   messages: [{ role: 'user'|'assistant', content: string, timestamp: ISO }],
//   documentText: string | null,
//   documentName: string | null,
//   imageData: { base64: string, mimeType: string, name: string } | null,
// }
const chats = new Map();

function getChat(id) {
  return chats.get(id) || null;
}

// ─── Routes ───────────────────────────────────────────────────────────────

// List all chats (sidebar)
app.get('/api/chats', (_req, res) => {
  const list = Array.from(chats.values())
    .map(({ id, title, createdAt, documentName, imageData }) => ({
      id,
      title,
      createdAt,
      hasDocument: !!documentName,
      hasImage: !!imageData,
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list);
});

// Create a new chat
app.post('/api/chats', (_req, res) => {
  const id = uuidv4();
  const chat = {
    id,
    title: 'New Chat',
    createdAt: new Date().toISOString(),
    messages: [],
    documentText: null,
    documentName: null,
    imageData: null,
  };
  chats.set(id, chat);
  res.status(201).json({ id, title: chat.title, createdAt: chat.createdAt });
});

// Get a chat (messages + metadata – no base64 blob)
app.get('/api/chats/:chatId', (req, res) => {
  const chat = getChat(req.params.chatId);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });

  res.json({
    id: chat.id,
    title: chat.title,
    createdAt: chat.createdAt,
    messages: chat.messages,
    documentName: chat.documentName,
    imageName: chat.imageData?.name || null,
  });
});

// Upload a file to a chat
app.post('/api/chats/:chatId/upload', upload.single('file'), async (req, res) => {
  const chat = getChat(req.params.chatId);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });

  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file provided' });

  const ext = path.extname(file.originalname).toLowerCase();

  try {
    if (ext === '.pdf') {
      const parsed = await pdfParse(file.buffer);
      chat.documentText = parsed.text;
      chat.documentName = file.originalname;
      return res.json({
        type: 'document',
        name: file.originalname,
        charCount: parsed.text.length,
      });
    }

    if (ext === '.txt') {
      chat.documentText = file.buffer.toString('utf-8');
      chat.documentName = file.originalname;
      return res.json({
        type: 'document',
        name: file.originalname,
        charCount: chat.documentText.length,
      });
    }

    if (['.png', '.jpg', '.jpeg'].includes(ext)) {
      chat.imageData = {
        base64: file.buffer.toString('base64'),
        mimeType: ext === '.png' ? 'image/png' : 'image/jpeg',
        name: file.originalname,
      };
      return res.json({ type: 'image', name: file.originalname });
    }

    return res.status(400).json({ error: 'Unsupported file type. Use PDF, TXT, PNG, or JPG.' });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'File processing failed: ' + err.message });
  }
});

// Send a message
app.post('/api/chats/:chatId/message', async (req, res) => {
  const chat = getChat(req.params.chatId);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });

  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'message field is required' });

  // Optimistically store the user message
  const userEntry = { role: 'user', content: message.trim(), timestamp: new Date().toISOString() };
  chat.messages.push(userEntry);

  // Auto-title the chat from the first user message
  if (chat.messages.length === 1) {
    chat.title = message.trim().slice(0, 50) + (message.trim().length > 50 ? '…' : '');
  }

  try {
    // ── Build system instruction ──────────────────────────────────────────
    let systemInstruction = 'You are a helpful, concise assistant.';
    if (chat.documentText) {
      systemInstruction +=
        `\n\nThe user has uploaded a document called "${chat.documentName}". ` +
        `Its full content follows — answer questions using this text:\n\n` +
        chat.documentText.slice(0, 60_000); // stay within token limits
    }
    if (chat.imageData) {
      systemInstruction += `\n\nThe user has also uploaded an image called "${chat.imageData.name}". ` +
        `It is included in every user message as inline image data.`;
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction,
    });

    // ── Convert stored history → Gemini format (exclude latest user msg) ─
    const geminiHistory = chat.messages.slice(0, -1).map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));

    const chatSession = model.startChat({ history: geminiHistory });

    // ── Current message parts (text + optional image) ─────────────────────
    const parts = [{ text: message.trim() }];
    if (chat.imageData) {
      parts.push({
        inlineData: {
          mimeType: chat.imageData.mimeType,
          data: chat.imageData.base64,
        },
      });
    }

    const result = await chatSession.sendMessage(parts);
    const responseText = result.response.text();

    // Store assistant message
    chat.messages.push({
      role: 'assistant',
      content: responseText,
      timestamp: new Date().toISOString(),
    });

    return res.json({
      response: responseText,
      chatId: chat.id,
      title: chat.title,
    });
  } catch (err) {
    console.error('Gemini error:', err);
    // Roll back the optimistically added user message
    chat.messages.pop();
    return res.status(500).json({ error: 'AI generation failed: ' + err.message });
  }
});

// ─── Start server ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅  Backend running → http://localhost:${PORT}`);
});
