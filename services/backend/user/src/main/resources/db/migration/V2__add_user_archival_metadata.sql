ALTER TABLE users ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE NULL;
ALTER TABLE users ADD COLUMN archived_by BIGINT NULL;
ALTER TABLE users ADD COLUMN archival_reason VARCHAR(500) NULL;
ALTER TABLE users ADD COLUMN reinstated_at TIMESTAMP WITH TIME ZONE NULL;
ALTER TABLE users ADD COLUMN reinstated_by BIGINT NULL;

ALTER TABLE users
    ADD CONSTRAINT fk_users_archived_by
        FOREIGN KEY (archived_by) REFERENCES users(user_id);

ALTER TABLE users
    ADD CONSTRAINT fk_users_reinstated_by
        FOREIGN KEY (reinstated_by) REFERENCES users(user_id);

CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_archived_by ON users(archived_by);
CREATE INDEX idx_users_reinstated_by ON users(reinstated_by);
