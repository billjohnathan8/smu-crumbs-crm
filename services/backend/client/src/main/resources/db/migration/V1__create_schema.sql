CREATE TABLE clients (
    client_id BIGSERIAL PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(20) NOT NULL,
    email_address VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    address VARCHAR(512) NOT NULL,
    city VARCHAR(512) NOT NULL,
    state VARCHAR(512) NOT NULL,
    country VARCHAR(50) NOT NULL,
    postal_code VARCHAR(512) NOT NULL,
    assigned_user_id VARCHAR(64) NOT NULL DEFAULT 'usr_unknown',
    identity_verification_status VARCHAR(20) NOT NULL DEFAULT 'unverified',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verification_document_type VARCHAR(20),
    verification_document_ref VARCHAR(255),
    verification_verified_at TIMESTAMPTZ,
    primary_document_type VARCHAR(20),
    primary_document_ref VARCHAR(255),
    address_document_type VARCHAR(20),
    address_document_ref VARCHAR(255),
    CONSTRAINT uk_clients_email UNIQUE (email_address),
    CONSTRAINT uk_clients_phone UNIQUE (phone_number)
);

CREATE TABLE accounts (
    account_id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
    account_type VARCHAR(20) NOT NULL,
    account_status VARCHAR(20) NOT NULL,
    opening_date DATE NOT NULL,
    initial_deposit NUMERIC(18, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    branch_id VARCHAR(40) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accounts_client_id ON accounts(client_id);
