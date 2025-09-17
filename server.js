const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { OpenAI } = require('openai');

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json());

// Initialize OpenAI client using v4 API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// POST route to categorize transactions
app.post('/categorize', async (req, res) => {
  const { transactions } = req.body;
  if (!Array.isArray(transactions)) {
    return res.status(400).json({ error: 'transactions array required' });
  }

  try {
    // Build system and user messages for chat completion
    const systemMessage = {
      role: 'system',
      content:
        'Du bist ein Helfer, der Transaktionsbeschreibungen in allgemeine Kategorien einordnet. ' +
        'Erlaubte Kategorien sind Essen, Reisen, Einkaufen, Gesundheit, Unterhaltung, Sonstiges. ' +
        'Antworte immer nur mit einem JSON-Array der Kategorien in derselben Reihenfolge wie die Eingaben.',
    };
    const userMessage = {
      role: 'user',
      content:
        'Kategorisiere die folgenden Umsatzbeschreibungen:\n' +
        transactions.map((t, i) => `${i + 1}. ${t}`).join('\n') +
        '\n\nFormatiere die Antwort als JSON-Array wie ["Kategorie1", "Kategorie2", ...] ohne weitere Erläuterungen.',
    };

    // Call OpenAI chat completion with gpt-3.5-turbo model
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [systemMessage, userMessage],
      max_tokens: 200,
      temperature: 0,
    });

    const text = completion.choices?.[0]?.message?.content?.trim() || '';
    let categories;
        try {
          // Try to parse the OpenAI response directly as JSON (e.g. ["Essen", "Reisen"]).
          categories = JSON.parse(text);
        } catch {
          // Fallback: remove any leading/trailing brackets or braces and quotes, then split by comma.
          const trimmed = text
            .replace(/^[\[{]*|[\]}]*$/g, '')
            .trim();
          categories = trimmed
            .split(',')
            .map((s) => s.replace(/"/g, '').trim())
            .filter(Boolean);
        }
    return res.json({ categories });
  } catch (err) {
    console.error(err);
    const status = err?.status || err?.response?.status || 500;
    const message =
      err?.error?.message ||
      err?.response?.data?.error?.message ||
      err?.message ||
      'OpenAI API error';
    return res.status(status).json({ error: message });
  }
});

// Optional health route
app.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
