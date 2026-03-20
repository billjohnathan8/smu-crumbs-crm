-- Remove the legacy hardcoded super-admin bootstrap row so runtime bootstrap
-- has a single source of truth for root admin identity (usr_1).
DELETE FROM users
WHERE user_id = 0
  AND lower(email) = lower('superAdmin@crm.com')
  AND role = 'super_admin';
