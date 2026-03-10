-- Widen columns that will store AES-256-GCM encrypted + Base64-encoded PII values.
ALTER TABLE clients ALTER COLUMN address TYPE VARCHAR(512);
ALTER TABLE clients ALTER COLUMN city TYPE VARCHAR(512);
ALTER TABLE clients ALTER COLUMN state TYPE VARCHAR(512);
ALTER TABLE clients ALTER COLUMN postal_code TYPE VARCHAR(512);

-- Add updated_at to accounts for update tracking.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
