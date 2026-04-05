-- CPM21-B: Add soft delete support for transaction records
ALTER TABLE transaction_records ADD COLUMN deleted BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX idx_transaction_records_deleted ON transaction_records(deleted);
