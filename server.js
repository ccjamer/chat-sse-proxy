import express from 'express';
import cors from 'cors';
import pg from 'pg';
import OpenAI from 'openai';

const app = express();
app.use(express.static('.'));
app.use(cors());
app.use(express.json());

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Hjælpefunktion til Cosine Similarity
function cosineSimilarity(a, b) {
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

app.post('/api/chat/stream', async (req, res) => {
  const clientId = req.body.clientId || req.body.client_id;
  const { message, sessionId } = req.body;

  if (!clientId || !message) {
    return res.status(400).json({ error: 'Mangler clientId eller message' });
  }

  const activeSessionId = sessionId || 'session_default';

  try {
    // 1. Hent klientkonfiguration
    const clientRes = await pool.query(
      'SELECT * FROM chat_clients WHERE client_id = $1 AND active = true',
      [clientId]
    );

    if (clientRes.rows.length === 0) {
      return res.status(404).json({ error: 'Klient ikke fundet' });
    }

    const clientConfig = clientRes.rows[0];
    const baseSystemPrompt = clientConfig.system_prompt || `Du er en imødekommende assistent for ${clientConfig.company_name || 'virksomheden'}.`;

    // 2. Hent de seneste 10 beskeder fra samtalehistorikken
    const historyRes = await pool.query(
      `SELECT role, message AS content 
       FROM chat_conversations 
       WHERE client_id = $1 AND session_id = $2 
       ORDER BY id ASC LIMIT 10`,
      [clientId, activeSessionId]
    );
    const dbHistory = historyRes.rows;

    // 3. Gem brugerens nye besked i databasen
    await pool.query(
      `INSERT INTO chat_conversations (client_id, session_id, role, message) 
       VALUES ($1, $2, $3, $4)`,
      [clientId, activeSessionId, 'user', message]
    );

    // 4. VEKTORSØGNING I DATABASE (FLOAT8[] Array)
    let contextText = '';
    try {
      const embeddingRes = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: message,
      });
      const userVector = embeddingRes.data[0].embedding;

      // Hent alle knowledge chunks for den specifikke klient
      const knowledgeRes = await pool.query(
        'SELECT content, embedding FROM chat_knowledge WHERE client_id = $1',
        [clientId]
      );

      if (knowledgeRes.rows.length > 0) {
        // Beregn similarity score for hver chunk
        const scoredChunks = knowledgeRes.rows.map(row => ({
          content: row.content,
          score: cosineSimilarity(userVector, row.embedding)
        }));

        // Sorter efter højeste score
        scoredChunks.sort((a, b) => b.score - a.score);

        // Vælg de 3 mest relevante chunks
        contextText = scoredChunks.slice(0, 3).map(c => c.content).join('\n---\n');
      }
    } catch (vectorErr) {
      console.warn('Vektorsøgning sprunget over eller fejlet:', vectorErr.message);
    }

    const finalSystemPrompt = contextText 
      ? `${baseSystemPrompt}\n\nBrug følgende relevante information om virksomheden til at besvare brugerens spørgsmål præcist:\n${contextText}`
      : baseSystemPrompt;

    // Sæt SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 5. Kald OpenAI med opdateret prompt + historik + ny besked
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: finalSystemPrompt },
        ...dbHistory,
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

    // 6. Gem AI'ens samlede svar i databasen
    if (fullAnswer) {
      await pool.query(
        `INSERT INTO chat_conversations (client_id, session_id, role, message) 
         VALUES ($1, $2, $3, $4)`,
        [clientId, activeSessionId, 'assistant', fullAnswer]
      );
    }

    // 7. Baggrunds-logging til n8n
    if (clientConfig.n8n_chat_endpoint || clientConfig.n8n_endpoint) {
      const targetEndpoint = clientConfig.n8n_chat_endpoint || clientConfig.n8n_endpoint;
      fetch(targetEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          sessionId: activeSessionId,
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
