-- V7: Align persisted verification document columns with the JPA entity model.
-- Previous migration V6 added single-document columns (`verification_document_*`),
-- while the service now expects split columns for primary + address documents.

ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS primary_document_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS primary_document_ref VARCHAR(255),
    ADD COLUMN IF NOT EXISTS address_document_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS address_document_ref VARCHAR(255);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'clients'
          AND column_name = 'verification_document_type'
    ) THEN
        UPDATE clients
        SET primary_document_type = COALESCE(primary_document_type, verification_document_type)
        WHERE verification_document_type IS NOT NULL;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'clients'
          AND column_name = 'verification_document_ref'
    ) THEN
        UPDATE clients
        SET primary_document_ref = COALESCE(primary_document_ref, verification_document_ref)
        WHERE verification_document_ref IS NOT NULL;
    END IF;
END $$;
