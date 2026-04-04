ALTER TABLE clients DROP CONSTRAINT IF EXISTS uk_clients_email;
ALTER TABLE clients DROP CONSTRAINT IF EXISTS uk_clients_phone;

DROP INDEX IF EXISTS uk_clients_email;
DROP INDEX IF EXISTS uk_clients_phone;

CREATE UNIQUE INDEX IF NOT EXISTS uk_clients_email_active
	ON clients (LOWER(email_address))
	WHERE deleted = false;

CREATE UNIQUE INDEX IF NOT EXISTS uk_clients_phone_active
	ON clients (phone_number)
	WHERE deleted = false;
