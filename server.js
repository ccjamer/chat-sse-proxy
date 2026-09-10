import express from 'express';
import cors from 'cors';
import pg from 'pg';

const app = express();
app.use(express.static('.'));
app.use(cors());
app.use(express.json());

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

app.post('/api/chat/stream', async (req, res) => {
  const clientId = req.body.clientId || req.body.client_id;
  const { message, history = [] } = req.body;

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

    // Sender forespørgslen direkte til n8n, som nu styrer AI'en og prompten
    const n8nResponse = await fetch(clientConfig.n8n_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        message,
        history
      })
    });

    if (!n8nResponse.ok) {
      throw new Error(`n8n svarede med status ${n8nResponse.status}`);
    }

    // Videresender streamet direkte fra n8n til browser-widgetten
    const reader = n8nResponse.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }

    res.end();

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
