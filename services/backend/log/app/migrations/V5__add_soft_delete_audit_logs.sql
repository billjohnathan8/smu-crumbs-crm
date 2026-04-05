-- AUDIT/CPM25: Add soft delete support for audit logs (append-only compliance)
ALTER TABLE audit_logs ADD COLUMN deleted BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX idx_audit_logs_deleted ON audit_logs(deleted);
