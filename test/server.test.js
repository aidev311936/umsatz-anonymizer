const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

const { app, setOpenAIClient } = require('../server');

const startServer = () =>
  new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });

const sendRequest = (port, { method, path, body }) =>
  new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const request = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data ? Buffer.byteLength(data) : 0,
        },
      },
      (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          raw += chunk;
        });
        response.on('end', () => {
          let parsed;
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch (error) {
            return reject(error);
          }
          resolve({ status: response.statusCode, body: parsed });
        });
      }
    );

    request.on('error', reject);

    if (data) {
      request.write(data);
    }
    request.end();
  });

test('categorize returns OpenAI JSON output as categories', async (t) => {
  const mockClient = {
    chat: {
      completions: {
        create: async () => ({
          choices: [
            {
              message: { content: '["Essen", "Reisen"]' },
            },
          ],
        }),
      },
    },
  };

  setOpenAIClient(mockClient);

  const { server, port } = await startServer();
  t.after(() => server.close());

  const response = await sendRequest(port, {
    method: 'POST',
    path: '/categorize',
    body: { transactions: ['Supermarkt', 'Hotel'] },
  });

  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(response.body, { categories: ['Essen', 'Reisen'] });
});

test('categorize falls back to parsing plain text responses', async (t) => {
  const mockClient = {
    chat: {
      completions: {
        create: async () => ({
          choices: [
            {
              message: { content: 'Essen, Unterhaltung , Sonstiges' },
            },
          ],
        }),
      },
    },
  };

  setOpenAIClient(mockClient);

  const { server, port } = await startServer();
  t.after(() => server.close());

  const response = await sendRequest(port, {
    method: 'POST',
    path: '/categorize',
    body: { transactions: ['Pizza', 'Kino', '???'] },
  });

  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(response.body, {
    categories: ['Essen', 'Unterhaltung', 'Sonstiges'],
  });
});

test('categorize validates the request payload', async (t) => {
  const { server, port } = await startServer();
  t.after(() => server.close());

  const response = await sendRequest(port, {
    method: 'POST',
    path: '/categorize',
    body: { transactions: 'invalid' },
  });

  assert.strictEqual(response.status, 400);
  assert.deepStrictEqual(response.body, {
    error: 'transactions array required',
  });
});

test('categorize surfaces OpenAI API errors', async (t) => {
  const mockClient = {
    chat: {
      completions: {
        create: async () => {
          const error = new Error('Rate limited');
          error.status = 429;
          throw error;
        },
      },
    },
  };

  setOpenAIClient(mockClient);

  const { server, port } = await startServer();
  t.after(() => server.close());

  const response = await sendRequest(port, {
    method: 'POST',
    path: '/categorize',
    body: { transactions: ['Flugticket'] },
  });

  assert.strictEqual(response.status, 429);
  assert.deepStrictEqual(response.body, { error: 'Rate limited' });
});
