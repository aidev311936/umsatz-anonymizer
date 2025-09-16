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
    // Construct prompt for categorization in German
    const prompt =
      `Kategorisiere die folgenden Umsatzbeschreibungen in Oberkategorien wie Essen, Reisen, Einkaufen, Gesundheit, Unterhaltung, Sonstiges. ` +
      `Gib das Ergebnis als JSON-Array in gleicher Reihenfolge zurück.\n\n` +
      transactions.map((t, i) => `${i + 1}. ${t}`).join('\n') +
      `\n\nErgebnisformat:\n[ "Kategorie1", "Kategorie2", ... ]\n\n`;

    // Call OpenAI completion
    const completion = await openai.completions.create({
      model: 'gpt-3.5-turbo-instruct',
      prompt,
      max_tokens: 100,
      temperature: 0,
    });

    const text = completion.data.choices[0].text.trim();
    let categories;
    try {
      categories = JSON.parse(text);
    } catch {
      categories = text
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    res.json({ categories });
  } catch (err) {
    // Better error handling: report OpenAI error details and status
    console.error(err);
    const status = err?.status || err?.response?.status || 500;
    const message =
      err?.error?.message ||
      err?.response?.data?.error?.message ||
      err?.message ||
      'OpenAI API error';
    res.status(status).json({ error: message });
  }
});

// Optional health route
app.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
