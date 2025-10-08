CREATE TABLE IF NOT EXISTS user_tokens (
  token TEXT PRIMARY KEY,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_on TIMESTAMPTZ NOT NULL DEFAULT now(),
  accessed_on TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  token TEXT NOT NULL REFERENCES user_tokens(token) ON DELETE CASCADE,
  amount TEXT,
  booking_text TEXT,
  booking_category TEXT,
  masked_data JSONB DEFAULT '{}'::jsonb,
  created_on TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_on TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bank_mapping (
  id BIGSERIAL PRIMARY KEY,
  token TEXT NOT NULL REFERENCES user_tokens(token) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  booking_date TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  amount TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  booking_text TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  booking_type TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  booking_date_parse_format TEXT NOT NULL DEFAULT '',
  created_on TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_on TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bank_mapping_unique_bank_per_token UNIQUE (token, bank_name)
);

CREATE OR REPLACE FUNCTION touch_user_token(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS
$$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE user_tokens
     SET accessed_on = now()
   WHERE token = p_token;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

CREATE OR REPLACE FUNCTION user_tokens_settings_access()
RETURNS TRIGGER
LANGUAGE plpgsql
AS
$$
BEGIN
  NEW.accessed_on = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_tokens_settings_access
  BEFORE UPDATE OF settings
  ON user_tokens
  FOR EACH ROW
  EXECUTE FUNCTION user_tokens_settings_access();

CREATE OR REPLACE FUNCTION set_row_updated_on()
RETURNS TRIGGER
LANGUAGE plpgsql
AS
$$
BEGIN
  NEW.updated_on = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_transactions_updated_on
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION set_row_updated_on();

CREATE TRIGGER trg_bank_mapping_updated_on
  BEFORE UPDATE ON bank_mapping
  FOR EACH ROW
  EXECUTE FUNCTION set_row_updated_on();
