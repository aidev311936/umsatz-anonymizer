const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { createApp } = require("../app.js");

function createSpy(fn) {
  const calls = [];
  const spy = (...args) => {
    calls.push(args);
    return fn(...args);
  };
  spy.calls = calls;
  return spy;
}

test("POST /auth/token issues a new token", async () => {
  const createToken = createSpy(async (token) => ({
    token,
    created_on: "2024-01-01T00:00:00.000Z",
    accessed_on: "2024-01-01T00:00:00.000Z",
  }));
  const db = {
    createToken,
    touchToken: async () => null,
    tokenExists: async () => false,
    getSettings: async () => ({}),
    updateSettings: async () => ({}),
    listTransactions: async () => [],
    replaceTransactions: async () => undefined,
    readMaskedTransactions: async () => [],
    replaceMaskedTransactions: async () => undefined,
    listBankMappings: async () => [],
    upsertBankMapping: async () => undefined,
    clearBankMappings: async () => undefined,
    clearTransactions: async () => undefined,
  };

  const app = createApp({ db });
  const response = await request(app)
    .post("/auth/token")
    .send({ action: "generate" })
    .expect(201);

  assert.equal(createToken.calls.length, 1);
  assert.ok(response.body.token);
  assert.equal(response.body.valid, undefined);
  const setCookie = response.get("set-cookie");
  assert.ok(Array.isArray(setCookie) && setCookie.some((cookie) => cookie.includes("umsatz_token")));
});

test("GET /settings requires authentication", async () => {
  const db = {
    createToken: async () => ({}),
    touchToken: async () => null,
    tokenExists: async () => false,
    getSettings: async () => ({}),
    updateSettings: async () => ({}),
    listTransactions: async () => [],
    replaceTransactions: async () => undefined,
    readMaskedTransactions: async () => [],
    replaceMaskedTransactions: async () => undefined,
    listBankMappings: async () => [],
    upsertBankMapping: async () => undefined,
    clearBankMappings: async () => undefined,
    clearTransactions: async () => undefined,
  };

  const app = createApp({ db });
  await request(app).get("/settings").expect(401);
});

test("POST /transactions validates payload", async () => {
  const replaceTransactions = createSpy(async () => undefined);
  const db = {
    createToken: async () => ({}),
    touchToken: async () => ({
      token: "test",
      created_on: "2024-01-01T00:00:00.000Z",
      accessed_on: "2024-01-01T00:00:00.000Z",
    }),
    tokenExists: async () => true,
    getSettings: async () => ({}),
    updateSettings: async () => ({}),
    listTransactions: async () => [],
    replaceTransactions,
    readMaskedTransactions: async () => [],
    replaceMaskedTransactions: async () => undefined,
    listBankMappings: async () => [],
    upsertBankMapping: async () => undefined,
    clearBankMappings: async () => undefined,
    clearTransactions: async () => undefined,
  };

  const app = createApp({ db });
  await request(app)
    .post("/transactions")
    .set("Cookie", "umsatz_token=test")
    .send({
      transactions: [
        {
          bank_name: "Test Bank",
          booking_text: "Payment",
          booking_amount: "10.00",
          booking_type: "CARD",
          booking_date: "2024-01-01",
          booking_date_raw: "2024-01-01",
          booking_date_iso: null,
          raw: "should trigger validation error",
        },
      ],
    })
    .expect(400);

  assert.equal(replaceTransactions.calls.length, 0);
});

test("POST /transactions stores sanitized entries", async () => {
  let stored = [];
  const db = {
    createToken: async () => ({}),
    touchToken: async () => ({
      token: "test",
      created_on: "2024-01-01T00:00:00.000Z",
      accessed_on: "2024-01-01T00:00:00.000Z",
    }),
    tokenExists: async () => true,
    getSettings: async () => ({}),
    updateSettings: async () => ({}),
    listTransactions: async () => stored,
    replaceTransactions: async (_token, entries) => {
      stored = entries;
    },
    readMaskedTransactions: async () => [],
    replaceMaskedTransactions: async () => undefined,
    listBankMappings: async () => [],
    upsertBankMapping: async () => undefined,
    clearBankMappings: async () => undefined,
    clearTransactions: async () => undefined,
  };

  const app = createApp({ db });
  const payload = {
    transactions: [
      {
        bank_name: "Test Bank",
        booking_text: "Payment",
        booking_amount: "10.00",
        booking_type: "CARD",
        booking_date: "2024-01-01",
        booking_date_raw: "2024-01-01",
        booking_date_iso: null,
      },
    ],
  };

  await request(app)
    .post("/transactions")
    .set("Cookie", "umsatz_token=test")
    .send(payload)
    .expect(204);

  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0], payload.transactions[0]);
});
