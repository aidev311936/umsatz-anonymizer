const { Pool } = require("pg");

const MASKED_SNAPSHOT_CATEGORY = "__masked_snapshot__";

function createPool(options = {}) {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }
  const sslMode = options.ssl ?? process.env.PGSSLMODE;
  let ssl = undefined;
  if (typeof sslMode === "string" && sslMode.toLowerCase() === "require") {
    ssl = { rejectUnauthorized: false };
  }
  return new Pool({
    connectionString,
    max: options.max ?? 10,
    ssl,
  });
}

async function withClient(pool, callback) {
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function createDb(pool) {
  async function createToken(token) {
    const insertResult = await pool.query(
      `INSERT INTO user_tokens(token)
       VALUES ($1)
       ON CONFLICT (token) DO NOTHING
       RETURNING token, created_on, accessed_on`,
      [token],
    );

    if (insertResult.rowCount === 0) {
      await pool.query("SELECT touch_user_token($1)", [token]);
      const existing = await pool.query(
        "SELECT token, created_on, accessed_on FROM user_tokens WHERE token = $1",
        [token],
      );
      return existing.rows[0] ?? null;
    }

    return insertResult.rows[0];
  }

  async function touchToken(token) {
    const result = await pool.query("SELECT touch_user_token($1) AS ok", [token]);
    if (!result.rows[0]?.ok) {
      return null;
    }
    const details = await pool.query(
      "SELECT token, created_on, accessed_on FROM user_tokens WHERE token = $1",
      [token],
    );
    return details.rows[0] ?? null;
  }

  async function tokenExists(token) {
    const result = await pool.query("SELECT 1 FROM user_tokens WHERE token = $1", [token]);
    return result.rowCount > 0;
  }

  async function getSettings(token) {
    await pool.query("SELECT touch_user_token($1)", [token]);
    const result = await pool.query("SELECT settings FROM user_tokens WHERE token = $1", [token]);
    return result.rows[0]?.settings ?? {};
  }

  async function updateSettings(token, settings) {
    const result = await pool.query(
      "UPDATE user_tokens SET settings = $2 WHERE token = $1 RETURNING settings",
      [token, settings],
    );
    if (result.rowCount === 0) {
      return null;
    }
    return result.rows[0].settings;
  }

  async function listTransactions(token) {
    const result = await pool.query(
      `SELECT masked_data
         FROM transactions
        WHERE token = $1 AND booking_category <> $2
        ORDER BY created_on DESC, id DESC`,
      [token, MASKED_SNAPSHOT_CATEGORY],
    );
    return result.rows
      .map((row) => row.masked_data)
      .filter((value) => value && typeof value === "object");
  }

  async function replaceTransactions(token, entries) {
    await withClient(pool, async (client) => {
      await client.query("BEGIN");
      try {
        await client.query(
          "DELETE FROM transactions WHERE token = $1 AND booking_category <> $2",
          [token, MASKED_SNAPSHOT_CATEGORY],
        );
        if (entries.length > 0) {
          const insertText =
            "INSERT INTO transactions(token, amount, booking_text, booking_category, masked_data) VALUES ($1, $2, $3, $4, $5::jsonb)";
          for (const entry of entries) {
            const payload = JSON.stringify(entry);
            const amount = typeof entry.booking_amount === "string" ? entry.booking_amount : null;
            const bookingText = typeof entry.booking_text === "string" ? entry.booking_text : null;
            const bookingCategory = typeof entry.booking_type === "string" ? entry.booking_type : null;
            await client.query(insertText, [
              token,
              amount,
              bookingText,
              bookingCategory,
              payload,
            ]);
          }
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async function readMaskedTransactions(token) {
    const result = await pool.query(
      `SELECT masked_data
         FROM transactions
        WHERE token = $1 AND booking_category = $2
        ORDER BY created_on DESC
        LIMIT 1`,
      [token, MASKED_SNAPSHOT_CATEGORY],
    );
    const payload = result.rows[0]?.masked_data;
    if (Array.isArray(payload)) {
      return payload;
    }
    return [];
  }

  async function replaceMaskedTransactions(token, entries) {
    await withClient(pool, async (client) => {
      await client.query("BEGIN");
      try {
        await client.query(
          "DELETE FROM transactions WHERE token = $1 AND booking_category = $2",
          [token, MASKED_SNAPSHOT_CATEGORY],
        );
        await client.query(
          "INSERT INTO transactions(token, booking_category, masked_data) VALUES ($1, $2, $3::jsonb)",
          [token, MASKED_SNAPSHOT_CATEGORY, JSON.stringify(entries)],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async function listBankMappings(token) {
    const result = await pool.query(
      `SELECT bank_name, booking_date, amount, booking_text, booking_type, booking_date_parse_format
         FROM bank_mapping
        WHERE token = $1
        ORDER BY bank_name ASC`,
      [token],
    );
    return result.rows.map((row) => ({
      bank_name: row.bank_name,
      booking_date: Array.isArray(row.booking_date) ? row.booking_date : [],
      booking_amount: Array.isArray(row.amount) ? row.amount : [],
      booking_text: Array.isArray(row.booking_text) ? row.booking_text : [],
      booking_type: Array.isArray(row.booking_type) ? row.booking_type : [],
      booking_date_parse_format: typeof row.booking_date_parse_format === "string" ? row.booking_date_parse_format : "",
    }));
  }

  async function upsertBankMapping(token, mapping) {
    await pool.query(
      `INSERT INTO bank_mapping(token, bank_name, booking_date, amount, booking_text, booking_type, booking_date_parse_format)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (token, bank_name)
       DO UPDATE SET
         booking_date = EXCLUDED.booking_date,
         amount = EXCLUDED.amount,
         booking_text = EXCLUDED.booking_text,
         booking_type = EXCLUDED.booking_type,
         booking_date_parse_format = EXCLUDED.booking_date_parse_format,
         updated_on = now()`,
      [
        token,
        mapping.bank_name,
        mapping.booking_date,
        mapping.booking_amount,
        mapping.booking_text,
        mapping.booking_type,
        mapping.booking_date_parse_format,
      ],
    );
  }

  async function clearBankMappings(token) {
    await pool.query("DELETE FROM bank_mapping WHERE token = $1", [token]);
  }

  async function clearTransactions(token) {
    await pool.query("DELETE FROM transactions WHERE token = $1", [token]);
  }

  return {
    createToken,
    touchToken,
    tokenExists,
    getSettings,
    updateSettings,
    listTransactions,
    replaceTransactions,
    readMaskedTransactions,
    replaceMaskedTransactions,
    listBankMappings,
    upsertBankMapping,
    clearBankMappings,
    clearTransactions,
    MASKED_SNAPSHOT_CATEGORY,
  };
}

module.exports = {
  createPool,
  createDb,
  MASKED_SNAPSHOT_CATEGORY,
};
