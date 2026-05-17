import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', agent: 'groq', version: '1.0' });
  });

  app.post('/api/chat', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    const SYNOD_API_KEY = process.env.SYNOD_API_KEY || 'local-dev-key';
    
    if (apiKey !== SYNOD_API_KEY && apiKey !== process.env.VITE_SYNOD_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(503).json({ error: 'GROQ_API_KEY not configured' });
    }

    try {
      const { message, history = [] } = req.body;
      
      const messages = [
        { role: 'system', content: 'You are Zenox, a helpful and intelligent personal AI assistant. Be clear, specific, and genuinely useful.' },
        ...history.map((m: any) => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
      ];

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama3-8b-8192',
          messages,
          stream: true,
        })
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Groq API error: ${err}`);
      }

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Transfer-Encoding', 'chunked');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.trim().slice(6));
              if (data.choices?.[0]?.delta?.content) {
                res.write(data.choices[0].delta.content);
              }
            } catch (e) {
              // ignore parse errors
            }
          }
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
