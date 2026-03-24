ALTER TABLE communications
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(160),
    ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS delivery_event VARCHAR(80);

ALTER TABLE communications
    ADD CONSTRAINT uk_communications_idempotency_key UNIQUE (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_communications_status_next_attempt
    ON communications(status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_communications_provider_message_id
    ON communications(provider_message_id);
