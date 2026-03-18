-- V6: Persist document evidence collected during KYC verification.
-- Stores the document type (e.g. NRIC) and an opaque reference supplied
-- by the user at verification time so the audit trail is complete.

ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS verification_document_type  VARCHAR(20),
    ADD COLUMN IF NOT EXISTS verification_document_ref   VARCHAR(255),
    ADD COLUMN IF NOT EXISTS verification_verified_at    TIMESTAMPTZ;
