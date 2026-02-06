CREATE TABLE IF NOT EXISTS accounts (
	account_id BIGSERIAL PRIMARY KEY,
	client_id BIGINT NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
	account_type VARCHAR(20) NOT NULL,
	account_status VARCHAR(20) NOT NULL,
	opening_date DATE NOT NULL,
	initial_deposit NUMERIC(18, 2) NOT NULL,
	currency VARCHAR(10) NOT NULL,
	branch_id VARCHAR(40) NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_client_id ON accounts(client_id);

