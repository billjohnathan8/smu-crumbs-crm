-- Clean legacy duplicates (active + archived) and enforce global uniqueness.
-- Keep one canonical row per email/phone, preferring active rows, then lowest client_id.

-- Remove prior "active-only" unique indexes/constraints if present.
ALTER TABLE clients DROP CONSTRAINT IF EXISTS uk_clients_email;
ALTER TABLE clients DROP CONSTRAINT IF EXISTS uk_clients_phone;

DROP INDEX IF EXISTS uk_clients_email_active;
DROP INDEX IF EXISTS uk_clients_phone_active;
DROP INDEX IF EXISTS uk_clients_email;
DROP INDEX IF EXISTS uk_clients_phone;

-- Deduplicate case-insensitive email collisions.
WITH ranked_emails AS (
	SELECT
		client_id,
		ROW_NUMBER() OVER (
			PARTITION BY LOWER(email_address)
			ORDER BY CASE WHEN deleted THEN 1 ELSE 0 END, client_id
		) AS rn
	FROM clients
),
email_dupes AS (
	SELECT client_id
	FROM ranked_emails
	WHERE rn > 1
)
UPDATE clients c
SET
	email_address = CONCAT('dedup+', c.client_id, '@archived.invalid'),
	updated_at = NOW()
FROM email_dupes d
WHERE c.client_id = d.client_id;

-- Deduplicate phone collisions.
WITH ranked_phones AS (
	SELECT
		client_id,
		ROW_NUMBER() OVER (
			PARTITION BY phone_number
			ORDER BY CASE WHEN deleted THEN 1 ELSE 0 END, client_id
		) AS rn
	FROM clients
),
phone_dupes AS (
	SELECT client_id
	FROM ranked_phones
	WHERE rn > 1
)
UPDATE clients c
SET
	phone_number = CONCAT('+9', LPAD(c.client_id::text, 14, '0')),
	updated_at = NOW()
FROM phone_dupes d
WHERE c.client_id = d.client_id;

-- Enforce global uniqueness across both active and archived rows.
CREATE UNIQUE INDEX uk_clients_email ON clients (LOWER(email_address));
CREATE UNIQUE INDEX uk_clients_phone ON clients (phone_number);
