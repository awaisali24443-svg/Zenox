import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', agent: 'gemini', version: '1.0' });
  });

  app.post('/api/chat', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    const SYNOD_API_KEY = process.env.SYNOD_API_KEY || 'local-dev-key';
    
    if (apiKey !== SYNOD_API_KEY && apiKey !== process.env.VITE_SYNOD_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (GEMINI_API_KEY) {
      GEMINI_API_KEY = GEMINI_API_KEY.trim().split('\n')[0].trim();
    }
    if (!GEMINI_API_KEY) {
      return res.status(503).json({ error: 'GEMINI_API_KEY not configured' });
    }

    try {
      const { message, history = [] } = req.body;
      
      const contents = history.map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));
      contents.push({ role: 'user', parts: [{ text: message }] });

      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents,
        config: {
          systemInstruction: 'You are Awais Codex, a helpful and intelligent personal AI assistant. Be clear, specific, and genuinely useful.'
        }
      });

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Transfer-Encoding', 'chunked');

      for await (const chunk of responseStream) {
        if (chunk.text) {
          res.write(chunk.text);
        }
      }
      res.end();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
