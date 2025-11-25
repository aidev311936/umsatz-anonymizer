const { Pool } = require("pg");

const MASKED_SNAPSHOT_CATEGORY = "__masked_snapshot__";
const ANON_RULES_KEY = "anonymization_rules_v1";
const DEFAULT_ANON_RULES = {
  version: 1,
  rules: [
    {
      id: "iban_mask",
      fields: ["booking_text"],
      type: "regex",
      pattern: "(DE\\d{2})[\\s-]?((?:\\d[\\s-]?){18})",
      flags: "gi",
      replacement: "$1 XXXX XXXX XXXX XXXX XX",
      enabled: true,
    },
    {
      id: "digits_mask",
      fields: ["booking_text"],
      type: "regex",
      pattern: "\\d{3,}",
      flags: "g",
      replacement: "XXX",
      enabled: true,
    },
  ],
};

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
      booking_account:
        typeof row.booking_account === "string" ? row.booking_account : "",
      booking_hash:
        typeof row.booking_hash === "string" && row.booking_hash.length > 0
          ? row.booking_hash
          : undefined,
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
              booking_amount,
              booking_account,
              booking_hash
         FROM masked_transactions
        WHERE token = $1 AND (booking_category IS NULL OR booking_category <> $2)
        ORDER BY created_on DESC, id DESC`,
      [token, MASKED_SNAPSHOT_CATEGORY],
    );
    return result.rows.map(rowToUnifiedTransaction);
  }

  async function listTransactionImports(token) {
    const result = await pool.query(
      `SELECT bank_name,
              COALESCE(booking_account, '') AS booking_account,
              created_on,
              MIN(COALESCE(NULLIF(booking_date_raw, ''), booking_date)) AS first_booking_date,
              MAX(COALESCE(NULLIF(booking_date_raw, ''), booking_date)) AS last_booking_date
         FROM masked_transactions
        WHERE token = $1
        GROUP BY bank_name, booking_account, created_on
        ORDER BY bank_name ASC, booking_account ASC, created_on DESC`,
      [token],
    );

    return result.rows.map((row) => ({
      bank_name: typeof row.bank_name === "string" ? row.bank_name : "",
      booking_account: typeof row.booking_account === "string" ? row.booking_account : "",
      created_on: row.created_on ?? null,
      first_booking_date:
        typeof row.first_booking_date === "string" ? row.first_booking_date : "",
      last_booking_date:
        typeof row.last_booking_date === "string" ? row.last_booking_date : "",
    }));
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
            "INSERT INTO masked_transactions(token, bank_name, booking_date, booking_date_raw, booking_date_iso, booking_text, booking_type, booking_amount, booking_account, booking_hash, booking_category) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)";
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
              typeof entry.booking_account === "string" ? entry.booking_account : null,
              typeof entry.booking_hash === "string" ? entry.booking_hash : null,
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
              booking_amount,
              booking_account,
              booking_hash
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
            "INSERT INTO masked_transactions(token, bank_name, booking_date, booking_date_raw, booking_date_iso, booking_text, booking_type, booking_amount, booking_account, booking_hash, booking_category) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)";
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
              typeof entry.booking_account === "string" ? entry.booking_account : null,
              typeof entry.booking_hash === "string" ? entry.booking_hash : null,
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

  function sanitizeDetectionHints(input) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return null;
    }

    const hints = {};

    if (Array.isArray(input.header_signature)) {
      const signature = input.header_signature
        .filter((entry) => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      if (signature.length > 0) {
        hints.header_signature = signature;
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(input, "without_header") &&
      typeof input.without_header === "object" &&
      input.without_header !== null &&
      !Array.isArray(input.without_header)
    ) {
      const { without_header } = input;
      const normalized = {};

      if (
        Object.prototype.hasOwnProperty.call(without_header, "column_count") &&
        Number.isInteger(without_header.column_count) &&
        without_header.column_count >= 0
      ) {
        normalized.column_count = without_header.column_count;
      }

      if (Array.isArray(without_header.column_markers)) {
        const markers = without_header.column_markers
          .filter((entry) => typeof entry === "string")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0);
        if (markers.length > 0) {
          normalized.column_markers = markers;
        }
      }

      if (Object.keys(normalized).length > 0) {
        hints.without_header = normalized;
      }
    }

    return Object.keys(hints).length > 0 ? hints : null;
  }

  function normalizeDetectionForStorage(value) {
    const sanitized = sanitizeDetectionHints(value);
    return sanitized ?? {};
  }

  function sanitizeRuleFields(fields) {
    if (!Array.isArray(fields)) {
      return [];
    }
    const sanitized = fields
      .filter((entry) => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => ALLOWED_TRANSACTION_KEYS.has(entry));
    return sanitized.length > 0 ? sanitized : ["booking_text"];
  }

  function normalizeRuleForStorage(rule) {
    const enabled = rule.enabled !== false;
    const id = typeof rule.id === "string" ? rule.id.trim() : "";
    if (rule.type === "regex") {
      return {
        id,
        rule_type: "regex",
        fields: sanitizeRuleFields(rule.fields),
        pattern: rule.pattern,
        flags: rule.flags ?? null,
        replacement: rule.replacement,
        mask_strategy: null,
        mask_char: null,
        min_len: null,
        mask_percent: null,
        enabled,
      };
    }
    return {
      id,
      rule_type: "mask",
      fields: sanitizeRuleFields(rule.fields),
      pattern: null,
      flags: null,
      replacement: null,
      mask_strategy: rule.maskStrategy,
      mask_char: typeof rule.maskChar === "string" ? rule.maskChar : null,
      min_len: Number.isInteger(rule.minLen) ? rule.minLen : null,
      mask_percent:
        typeof rule.maskPercent === "number" && Number.isFinite(rule.maskPercent)
          ? rule.maskPercent
          : null,
      enabled,
    };
  }

  function rowToAnonymizationRule(row) {
    const fields = Array.isArray(row.fields)
      ? row.fields.filter((entry) => typeof entry === "string")
      : [];
    const enabled = row.enabled !== false;
    if (row.rule_type === "mask") {
      const rule = {
        id: row.id,
        type: "mask",
        fields,
        maskStrategy: row.mask_strategy ?? "full",
        maskChar: typeof row.mask_char === "string" ? row.mask_char : undefined,
        minLen: Number.isInteger(row.min_len) ? row.min_len : undefined,
        maskPercent:
          typeof row.mask_percent === "number" && Number.isFinite(row.mask_percent)
            ? row.mask_percent
            : undefined,
        enabled,
      };
      return rule;
    }
    return {
      id: row.id,
      type: "regex",
      fields,
      pattern: row.pattern ?? "",
      flags: typeof row.flags === "string" ? row.flags : undefined,
      replacement: row.replacement ?? "",
      enabled,
    };
  }

  function sanitizeAnonymizationRules(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((rule) => rowToAnonymizationRule(normalizeRuleForStorage(rule)))
      .filter((rule) => rule.id.trim().length > 0);
  }

  function readRulesFromSettings(settings) {
    const container = settings?.[ANON_RULES_KEY];
    if (container && typeof container === "object" && !Array.isArray(container) && "rules" in container) {
      const rules = sanitizeAnonymizationRules(container.rules);
      const version = Number.isInteger(container.version) ? container.version : DEFAULT_ANON_RULES.version;
      return {
        rules,
        version,
      };
    }
    return DEFAULT_ANON_RULES;
  }

  async function persistRulesInSettings(token, payload) {
    const settings = await getSettings(token);
    const normalized = {
      ...settings,
      [ANON_RULES_KEY]: {
        version: payload.version ?? DEFAULT_ANON_RULES.version,
        rules: sanitizeAnonymizationRules(payload.rules),
      },
    };
    const saved = await updateSettings(token, normalized);
    if (!saved) {
      return DEFAULT_ANON_RULES;
    }
    return readRulesFromSettings(saved);
  }

  async function listBankMappings(token) {
    const result = await pool.query(
      `SELECT bank_name,
              booking_date,
              amount,
              booking_text,
              booking_type,
              booking_date_parse_format,
              without_header,
              detection_hints
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
      without_header: row.without_header === true,
      detection: sanitizeDetectionHints(row.detection_hints),
    }));
  }

  async function upsertBankMapping(token, mapping) {
    await pool.query(
      `INSERT INTO bank_mapping(
          bank_name,
          booking_date,
          amount,
          booking_text,
          booking_type,
          booking_date_parse_format,
          without_header,
          detection_hints)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (bank_name)
       DO UPDATE SET
         booking_date = EXCLUDED.booking_date,
         amount = EXCLUDED.amount,
         booking_text = EXCLUDED.booking_text,
         booking_type = EXCLUDED.booking_type,
         booking_date_parse_format = EXCLUDED.booking_date_parse_format,
         without_header = EXCLUDED.without_header,
         detection_hints = EXCLUDED.detection_hints,
         updated_on = now()`,
      [
        mapping.bank_name,
        mapping.booking_date,
        mapping.booking_amount,
        mapping.booking_text,
        mapping.booking_type,
        mapping.booking_date_parse_format,
        mapping.without_header === true,
        normalizeDetectionForStorage(mapping.detection),
      ],
    );
  }

  async function listAnonymizationRules(token) {
    const settings = await getSettings(token);
    return readRulesFromSettings(settings).rules;
  }

  async function replaceAnonymizationRules(token, rules) {
    const updated = await persistRulesInSettings(token, { rules, version: DEFAULT_ANON_RULES.version });
    return updated.rules;
  }

  async function createAnonymizationRule(token, rule) {
    const settings = await getSettings(token);
    const existing = readRulesFromSettings(settings);
    const filtered = existing.rules.filter((entry) => entry.id !== rule.id);
    const sanitized = sanitizeAnonymizationRules([...filtered, rule]);
    const saved = await persistRulesInSettings(token, { rules: sanitized, version: existing.version });
    const created = saved.rules.find((entry) => entry.id === rule.id);
    return created ?? sanitized.find((entry) => entry.id === rule.id) ?? null;
  }

  async function updateAnonymizationRule(token, id, rule) {
    const settings = await getSettings(token);
    const existing = readRulesFromSettings(settings);
    const index = existing.rules.findIndex((entry) => entry.id === id);
    if (index === -1) {
      return null;
    }
    const updatedRules = [...existing.rules];
    updatedRules[index] = rowToAnonymizationRule(normalizeRuleForStorage({ ...rule, id }));
    const saved = await persistRulesInSettings(token, { rules: updatedRules, version: existing.version });
    return saved.rules.find((entry) => entry.id === id) ?? null;
  }

  async function deleteAnonymizationRule(token, id) {
    const settings = await getSettings(token);
    const existing = readRulesFromSettings(settings);
    const remaining = existing.rules.filter((entry) => entry.id !== id);
    if (remaining.length === existing.rules.length) {
      return false;
    }
    await persistRulesInSettings(token, { rules: remaining, version: existing.version });
    return true;
  }

  async function clearAnonymizationRules(token) {
    const settings = await getSettings(token);
    const updated = { ...settings };
    if (ANON_RULES_KEY in updated) {
      delete updated[ANON_RULES_KEY];
    }
    await updateSettings(token, updated);
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
    listTransactionImports,
    readMaskedTransactions,
    replaceMaskedTransactions,
    listAnonymizationRules,
    replaceAnonymizationRules,
    createAnonymizationRule,
    updateAnonymizationRule,
    deleteAnonymizationRule,
    listBankMappings,
    upsertBankMapping,
    clearBankMappings,
    clearAnonymizationRules,
    clearTransactions,
    MASKED_SNAPSHOT_CATEGORY,
  };
}

module.exports = {
  createPool,
  createDb,
  MASKED_SNAPSHOT_CATEGORY,
};
