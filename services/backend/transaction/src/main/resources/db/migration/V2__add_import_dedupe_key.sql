ALTER TABLE transaction_records
	ADD COLUMN IF NOT EXISTS import_dedupe_key VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_records_import_dedupe_key
	ON transaction_records(import_dedupe_key);
