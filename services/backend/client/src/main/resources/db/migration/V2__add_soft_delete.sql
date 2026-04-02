ALTER TABLE clients ADD COLUMN deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE accounts ADD COLUMN deleted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_clients_deleted ON clients(deleted);
CREATE INDEX idx_accounts_deleted ON accounts(deleted);
