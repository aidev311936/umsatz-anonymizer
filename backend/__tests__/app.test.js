const { test, mock } = require("node:test");
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

function restoreEnv(original) {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test("auth cookie switches to cross-site policy when remote origins are configured", async () => {
  const originalEnv = {
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    AUTH_COOKIE_SECURE: process.env.AUTH_COOKIE_SECURE,
    AUTH_COOKIE_SAMESITE: process.env.AUTH_COOKIE_SAMESITE,
  };
  process.env.ALLOWED_ORIGINS = "https://example.com";
  delete process.env.AUTH_COOKIE_SECURE;
  delete process.env.AUTH_COOKIE_SAMESITE;

  const db = {
    createToken: async (token) => ({
      token,
      created_on: "2024-01-01T00:00:00.000Z",
      accessed_on: "2024-01-01T00:00:00.000Z",
    }),
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

  try {
    const app = createApp({ db });
    const tokenResponse = await request(app).post("/auth/token").send({}).expect(201);
    const issuedCookies = tokenResponse.get("set-cookie");
    assert.ok(issuedCookies.some((cookie) => /SameSite=None/.test(cookie)));
    assert.ok(issuedCookies.some((cookie) => /;\s*Secure/i.test(cookie)));

    const logoutResponse = await request(app).post("/auth/logout").expect(204);
    const clearedCookies = logoutResponse.get("set-cookie");
    assert.ok(clearedCookies.some((cookie) => /SameSite=None/.test(cookie)));
    assert.ok(clearedCookies.some((cookie) => /;\s*Secure/i.test(cookie)));
  } finally {
    restoreEnv(originalEnv);
  }
});

test("auth cookie honours explicit SameSite/Secure overrides", async () => {
  const originalEnv = {
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    AUTH_COOKIE_SECURE: process.env.AUTH_COOKIE_SECURE,
    AUTH_COOKIE_SAMESITE: process.env.AUTH_COOKIE_SAMESITE,
  };
  process.env.ALLOWED_ORIGINS = "https://example.com";
  process.env.AUTH_COOKIE_SECURE = "false";
  process.env.AUTH_COOKIE_SAMESITE = "lax";

  const db = {
    createToken: async (token) => ({
      token,
      created_on: "2024-01-01T00:00:00.000Z",
      accessed_on: "2024-01-01T00:00:00.000Z",
    }),
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

  try {
    const app = createApp({ db });
    const response = await request(app).post("/auth/token").send({}).expect(201);
    const cookies = response.get("set-cookie");
    assert.ok(cookies.some((cookie) => /SameSite=Lax/.test(cookie)));
    assert.ok(cookies.every((cookie) => !/SameSite=None/.test(cookie)));
    assert.ok(cookies.every((cookie) => !/;\s*Secure/i.test(cookie)));
  } finally {
    restoreEnv(originalEnv);
  }
});

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

test("POST /transactions/masked stores booking hash", async () => {
  const replaceMaskedTransactions = createSpy(async () => undefined);
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
    replaceTransactions: async () => undefined,
    readMaskedTransactions: async () => [],
    replaceMaskedTransactions,
    listBankMappings: async () => [],
    upsertBankMapping: async () => undefined,
    clearBankMappings: async () => undefined,
    clearTransactions: async () => undefined,
  };

  const app = createApp({ db });
  const entry = {
    bank_name: "Test Bank",
    booking_text: "Payment",
    booking_amount: "100.00",
    booking_date: "2024-01-15",
    booking_date_raw: "15.01.2024",
    booking_date_iso: "2024-01-15T00:00:00.000Z",
    booking_type: "transfer",
    booking_hash: "hash123",
  };

  await request(app)
    .post("/transactions/masked")
    .set("Cookie", "umsatz_token=test")
    .send({ transactions: [entry] })
    .expect(204);

  assert.equal(replaceMaskedTransactions.calls.length, 1);
  assert.equal(replaceMaskedTransactions.calls[0][0], "test");
  assert.equal(replaceMaskedTransactions.calls[0][1].length, 1);
  assert.deepEqual(replaceMaskedTransactions.calls[0][1][0], entry);
});

test("routes are reachable under configured API base path", async () => {
  let latestToken = "";
  const db = {
    createToken: async (token) => {
      latestToken = token;
      return {
        token,
        created_on: "2024-01-01T00:00:00.000Z",
        accessed_on: "2024-01-01T00:00:00.000Z",
      };
    },
    touchToken: async () => null,
    tokenExists: async (token) => token === latestToken,
    getSettings: async () => ({ foo: "bar" }),
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

  const app = createApp({ db, basePath: "/api" });
  const tokenResponse = await request(app).post("/api/auth/token").send({}).expect(201);
  const token = tokenResponse.body.token;
  assert.ok(token);

  await request(app)
    .get("/api/settings")
    .set("Cookie", `umsatz_token=${token}`)
    .expect(200, { settings: { foo: "bar" } });

  await request(app)
    .get("/settings")
    .set("Cookie", `umsatz_token=${token}`)
    .expect(200, { settings: { foo: "bar" } });
});

test("persistMaskedTransactions posts booking hashes to backend", async () => {
  const originalDocument = global.document;
  global.document = { querySelector: () => null };

  const snapshot = [
    {
      bank_name: "Test Bank",
      booking_text: "Payment",
      booking_amount: "100.00",
      booking_date: "2024-01-15",
      booking_date_raw: "15.01.2024",
      booking_date_iso: "2024-01-15T00:00:00.000Z",
      booking_type: "transfer",
      hash: "hash123",
    },
  ];

  const fetchCalls = [];
  mock.method(global, "fetch", async (url, init = {}) => {
    fetchCalls.push({ url, init });
    return {
      ok: true,
      status: 200,
      text: async () => "{}",
    };
  });

  try {
    const storageModule = await import("../../dist/storage.js");
    const restoreStorage = storageModule.__setMaskedTransactionsStorageForTests({
      loadSnapshot: async () => snapshot,
      store: async () => snapshot,
    });
    try {
      await storageModule.persistMaskedTransactions();

      assert.equal(fetchCalls.length, 1);
      assert.equal(fetchCalls[0].url, "/transactions/masked");
      const body = JSON.parse(fetchCalls[0].init.body);
      assert.deepEqual(body, {
        transactions: [
          {
            bank_name: "Test Bank",
            booking_text: "Payment",
            booking_amount: "100.00",
            booking_date: "2024-01-15",
            booking_date_raw: "15.01.2024",
            booking_date_iso: "2024-01-15T00:00:00.000Z",
            booking_type: "transfer",
            booking_hash: "hash123",
          },
        ],
      });
    } finally {
      restoreStorage();
    }
  } finally {
    mock.restoreAll();
    if (originalDocument === undefined) {
      delete global.document;
    } else {
      global.document = originalDocument;
    }
  }
});
