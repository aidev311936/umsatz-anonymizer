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

  function rowToUnifiedTransaction(row) {
    const bookingDate = typeof row.booking_date === "string" ? row.booking_date : "";
    const rawDate =
      typeof row.booking_date_raw === "string" && row.booking_date_raw.length > 0
        ? row.booking_date_raw
        : bookingDate;
    return {
      bank_name: typeof row.bank_name === "string" ? row.bank_name : "",
      booking_date: bookingDate,
      booking_date_raw: rawDate,
      booking_date_iso:
        typeof row.booking_date_iso === "string" && row.booking_date_iso.length > 0
          ? row.booking_date_iso
          : null,
      booking_text: typeof row.booking_text === "string" ? row.booking_text : "",
      booking_type: typeof row.booking_type === "string" ? row.booking_type : "",
      booking_amount:
        typeof row.booking_amount === "string"
          ? row.booking_amount
          : typeof row.amount === "string"
          ? row.amount
          : "",
    };
  }

  async function listTransactions(token) {
    const result = await pool.query(
      `SELECT bank_name,
              booking_date,
              booking_date_raw,
              booking_date_iso,
              booking_text,
              booking_type,
              booking_amount
         FROM masked_transactions
        WHERE token = $1 AND (booking_category IS NULL OR booking_category <> $2)
        ORDER BY created_on DESC, id DESC`,
      [token, MASKED_SNAPSHOT_CATEGORY],
    );
    return result.rows.map(rowToUnifiedTransaction);
  }

  async function replaceTransactions(token, entries) {
    await withClient(pool, async (client) => {
      await client.query("BEGIN");
      try {
        await client.query(
          "DELETE FROM masked_transactions WHERE token = $1 AND (booking_category IS NULL OR booking_category <> $2)",
          [token, MASKED_SNAPSHOT_CATEGORY],
        );
        if (entries.length > 0) {
          const insertText =
            "INSERT INTO masked_transactions(token, bank_name, booking_date, booking_date_raw, booking_date_iso, booking_text, booking_type, booking_amount, booking_category) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)";
          for (const entry of entries) {
            await client.query(insertText, [
              token,
              typeof entry.bank_name === "string" ? entry.bank_name : null,
              typeof entry.booking_date === "string" ? entry.booking_date : null,
              typeof entry.booking_date_raw === "string" ? entry.booking_date_raw : null,
              typeof entry.booking_date_iso === "string" ? entry.booking_date_iso : null,
              typeof entry.booking_text === "string" ? entry.booking_text : null,
              typeof entry.booking_type === "string" ? entry.booking_type : null,
              typeof entry.booking_amount === "string" ? entry.booking_amount : null,
              null,
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
      `SELECT bank_name,
              booking_date,
              booking_date_raw,
              booking_date_iso,
              booking_text,
              booking_type,
              booking_amount
         FROM masked_transactions
        WHERE token = $1 AND booking_category = $2
        ORDER BY created_on DESC, id DESC`,
      [token, MASKED_SNAPSHOT_CATEGORY],
    );
    return result.rows.map(rowToUnifiedTransaction);
  }

  async function replaceMaskedTransactions(token, entries) {
    await withClient(pool, async (client) => {
      await client.query("BEGIN");
      try {
        await client.query(
          "DELETE FROM masked_transactions WHERE token = $1 AND booking_category = $2",
          [token, MASKED_SNAPSHOT_CATEGORY],
        );
        if (entries.length > 0) {
          const insertText =
            "INSERT INTO masked_transactions(token, bank_name, booking_date, booking_date_raw, booking_date_iso, booking_text, booking_type, booking_amount, booking_category) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)";
          for (const entry of entries) {
            await client.query(insertText, [
              token,
              typeof entry.bank_name === "string" ? entry.bank_name : null,
              typeof entry.booking_date === "string" ? entry.booking_date : null,
              typeof entry.booking_date_raw === "string" ? entry.booking_date_raw : null,
              typeof entry.booking_date_iso === "string" ? entry.booking_date_iso : null,
              typeof entry.booking_text === "string" ? entry.booking_text : null,
              typeof entry.booking_type === "string" ? entry.booking_type : null,
              typeof entry.booking_amount === "string" ? entry.booking_amount : null,
              MASKED_SNAPSHOT_CATEGORY,
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

  async function listBankMappings(token) {
    const result = await pool.query(
      `SELECT bank_name, booking_date, amount, booking_text, booking_type, booking_date_parse_format
         FROM bank_mapping
        ORDER BY bank_name ASC`,
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
      `INSERT INTO bank_mapping(bank_name, booking_date, amount, booking_text, booking_type, booking_date_parse_format)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (bank_name)
       DO UPDATE SET
         booking_date = EXCLUDED.booking_date,
         amount = EXCLUDED.amount,
         booking_text = EXCLUDED.booking_text,
         booking_type = EXCLUDED.booking_type,
         booking_date_parse_format = EXCLUDED.booking_date_parse_format,
         updated_on = now()`,
      [
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
    void token;
    return;
  }

  async function clearTransactions(token) {
    await pool.query(
      "DELETE FROM masked_transactions WHERE token = $1",
      [token],
    );
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
