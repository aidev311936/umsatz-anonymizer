const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Configuration, OpenAIApi } = require('openai');

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json());

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

app.post('/categorize', async (req, res) => {
  const { transactions } = req.body;
  if (!Array.isArray(transactions)) {
    return res.status(400).json({ error: 'transactions array required' });
  }

  try {
    const prompt =
      'Kategorisiere die folgenden Umsatzbeschreibungen in Oberkategorien wie Essen, Reisen, Einkaufen, Gesundheit, Unterhaltung, Sonstiges. ' +
      'Gib das Ergebnis als JSON-Array in gleicher Reihenfolge zurück.\n\n' +
      transactions.map((t, i) => `${i + 1}. ${t}`).join('\n') +
      '\n\nErgebnisformat:\n[ "Kategorie1", "Kategorie2", ... ]\n\n';

    const completion = await openai.createCompletion({
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
      categories = text.split('\n').map(s => s.trim()).filter(Boolean);
    }
    res.json({ categories });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'OpenAI API error' });
  }
});

app.get('/', (req, res) => {
  res.send('API is running');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
