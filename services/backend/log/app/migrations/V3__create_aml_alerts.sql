CREATE TABLE IF NOT EXISTS aml_alerts (
    id BIGSERIAL PRIMARY KEY,
    alert_id VARCHAR(64) NOT NULL UNIQUE,
    client_id VARCHAR(64) NOT NULL,
    transaction_id VARCHAR(255),
    alert_type VARCHAR(64) NOT NULL,
    description VARCHAR(2000) NOT NULL,
    detected_at TIMESTAMPTZ NOT NULL,
    review_status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aml_alerts_client_id ON aml_alerts(client_id);
CREATE INDEX IF NOT EXISTS idx_aml_alerts_alert_type ON aml_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_aml_alerts_review_status ON aml_alerts(review_status);
CREATE INDEX IF NOT EXISTS idx_aml_alerts_detected_at ON aml_alerts(detected_at);
