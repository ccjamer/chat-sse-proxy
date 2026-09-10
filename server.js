import express from 'express';
import cors from 'cors';
import pg from 'pg';
import OpenAI from 'openai';

const app = express();
app.use(cors());
app.use(express.json());

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/api/chat/stream', async (req, res) => {
  const clientId = req.body.clientId || req.body.client_id;
  const { message, history = [] } = req.body

  try {
    const clientRes = await pool.query(
      'SELECT * FROM chat_clients WHERE client_id = $1 AND active = true',
      [clientId]
    );

    if (clientRes.rows.length === 0) {
      return res.status(404).json({ error: 'Klient ikke fundet' });
    }

    const clientConfig = clientRes.rows[0];

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `Du er en assistent for ${clientConfig.title}.` },
        ...history,
        { role: 'user', content: message }
      ],
      stream: true,
    });

    let fullAnswer = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullAnswer += content;
        res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

    if (clientConfig.n8n_endpoint) {
      fetch(clientConfig.n8n_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          userMessage: message,
          aiResponse: fullAnswer,
          timestamp: new Date().toISOString()
        })
      }).catch(err => console.error('Baggrunds-n8n fejl:', err));
    }

  } catch (error) {
    console.error('Stream fejl:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Server fejl' });
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Der opstod en fejl' })}\n\n`);
      res.end();
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SSE Proxy kører på port ${PORT}`));
