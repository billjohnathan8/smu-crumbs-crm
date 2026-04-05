-- CPM17/CPM24-A/CPM24-B: Add explicit client lifecycle status
ALTER TABLE clients ADD COLUMN client_status VARCHAR(20) NOT NULL DEFAULT 'active';
CREATE INDEX idx_clients_client_status ON clients(client_status);

-- CPM14: Add reviewer notes for verification review attestation
ALTER TABLE clients ADD COLUMN verification_reviewer_notes VARCHAR(2000);
ALTER TABLE clients ADD COLUMN verification_reviewed_by VARCHAR(64);
