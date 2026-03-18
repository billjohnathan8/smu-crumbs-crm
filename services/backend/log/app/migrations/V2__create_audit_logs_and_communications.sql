CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    action VARCHAR(40) NOT NULL,
    attribute_name VARCHAR(100) NOT NULL,
    before_value VARCHAR(2000),
    after_value VARCHAR(2000),
    user_id VARCHAR(64) NOT NULL,
    client_id VARCHAR(64) NOT NULL,
    date_time TIMESTAMPTZ NOT NULL,
    correlation_id VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_client_id ON audit_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_date_time ON audit_logs(date_time);

CREATE TABLE IF NOT EXISTS communications (
    id BIGSERIAL PRIMARY KEY,
    client_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    channel VARCHAR(40) NOT NULL DEFAULT 'email',
    to_email VARCHAR(320) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    body VARCHAR(20000) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'queued',
    provider_message_id VARCHAR(200),
    error_message VARCHAR(2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_communications_client_id ON communications(client_id);
