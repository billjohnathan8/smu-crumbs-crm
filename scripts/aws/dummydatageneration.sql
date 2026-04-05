/* =========================================================
   CRM LOAD TEST DATA (RE-RUNNABLE)
   Aurora MySQL + MySQL Workbench compatible

   Requirements:
   - Root admin email stays: admin@crm.com
   - First agent email stays: agent1@crm.com

   Generation helpers: digits, acct_k, tx_k, acct_map
   (can be dropped after generation)

   Target scale:
   - 10,000 clients
   - 3 accounts per client => 30,000 accounts
   - 50 transactions per account => 1,500,000 transactions
   - Logs total: 90,000 (Create/Update/Read mix)

   Constraints:
   - No CTE, no TEMP tables, no session variables.
   ========================================================= */

DROP DATABASE IF EXISTS crm_db;
CREATE DATABASE crm_db CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE crm_db;

-- =====================================================
-- DROP TABLES (child -> parent)
-- =====================================================
DROP TABLE IF EXISTS logs;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS clients;
DROP TABLE IF EXISTS users;

DROP TABLE IF EXISTS acct_map;
DROP TABLE IF EXISTS tx_k;
DROP TABLE IF EXISTS acct_k;
DROP TABLE IF EXISTS digits;

-- =====================================================
-- SCHEMA (banking-like)
-- =====================================================

CREATE TABLE users (
  id         VARCHAR(20)  NOT NULL,
  first_name VARCHAR(60)  NOT NULL,
  last_name  VARCHAR(60)  NOT NULL,
  email      VARCHAR(120) NOT NULL,
  role       ENUM('Admin','Agent') NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role)
) ENGINE=InnoDB;

CREATE TABLE clients (
  client_id      VARCHAR(20)  NOT NULL,
  first_name     VARCHAR(60)  NOT NULL,
  last_name      VARCHAR(60)  NOT NULL,
  date_of_birth  DATE         NOT NULL,
  gender         ENUM('Male','Female','Non-binary','Prefer not to say') NOT NULL,
  email_address  VARCHAR(120) NOT NULL,
  phone_number   VARCHAR(20)  NOT NULL,
  address        VARCHAR(200) NOT NULL,
  city           VARCHAR(60)  NOT NULL,
  state          VARCHAR(60)  NOT NULL,
  country        VARCHAR(60)  NOT NULL,
  postal_code    CHAR(6)      NOT NULL,
  agent_id       VARCHAR(20)  NOT NULL,
  PRIMARY KEY (client_id),
  UNIQUE KEY uq_clients_email (email_address),
  UNIQUE KEY uq_clients_phone (phone_number),
  KEY idx_clients_agent (agent_id),
  CONSTRAINT fk_clients_agent
    FOREIGN KEY (agent_id) REFERENCES users(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Multiple accounts per client (3 accounts)
CREATE TABLE accounts (
  account_id      VARCHAR(20)   NOT NULL,
  client_id       VARCHAR(20)   NOT NULL,
  account_type    ENUM('Savings','Checking','Business') NOT NULL,
  account_status  ENUM('Active','Inactive','Pending')  NOT NULL,
  opening_date    DATE          NOT NULL,
  initial_deposit DECIMAL(12,2) NOT NULL,
  currency        CHAR(3)       NOT NULL,
  branch_id       CHAR(5)       NOT NULL,
  PRIMARY KEY (account_id),
  KEY idx_accounts_client (client_id),
  KEY idx_accounts_branch (branch_id),
  CONSTRAINT fk_accounts_client
    FOREIGN KEY (client_id) REFERENCES clients(client_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Transactions reference account_id (banking-like)
CREATE TABLE transactions (
  id               VARCHAR(24)   NOT NULL,
  account_id       VARCHAR(20)   NOT NULL,
  client_id        VARCHAR(20)   NOT NULL,
  transaction_type CHAR(1)       NOT NULL, -- D/W
  amount           DECIMAL(12,2) NOT NULL,
  `date`           DATE          NOT NULL,
  status           ENUM('Completed','Pending','Failed') NOT NULL,
  PRIMARY KEY (id),
  KEY idx_tx_account (account_id),
  KEY idx_tx_client (client_id),
  KEY idx_tx_date (`date`),
  CONSTRAINT fk_tx_account
    FOREIGN KEY (account_id) REFERENCES accounts(account_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_tx_client
    FOREIGN KEY (client_id) REFERENCES clients(client_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Logs: includes Read in CRUD enum
CREATE TABLE logs (
  id             BIGINT NOT NULL AUTO_INCREMENT,
  crud           ENUM('Create','Read','Update','Delete') NOT NULL,
  entity_type    ENUM('Client','Account','Transaction') NOT NULL,
  attribute_name VARCHAR(120) NOT NULL,
  before_value   VARCHAR(255) NOT NULL,
  after_value    VARCHAR(255) NOT NULL,
  agent_id       VARCHAR(20)  NOT NULL,
  client_id      VARCHAR(20)  NOT NULL,
  `datetime`     VARCHAR(25)  NOT NULL,
  PRIMARY KEY (id),
  KEY idx_logs_client (client_id),
  KEY idx_logs_agent (agent_id),
  CONSTRAINT fk_logs_agent
    FOREIGN KEY (agent_id) REFERENCES users(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_logs_client
    FOREIGN KEY (client_id) REFERENCES clients(client_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB;

-- =====================================================
-- HELPERS (permanent, deterministic)
-- =====================================================

CREATE TABLE digits (d TINYINT NOT NULL PRIMARY KEY) ENGINE=InnoDB;
INSERT INTO digits(d) VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9);

-- account index per client: 1..3
CREATE TABLE acct_k (k TINYINT NOT NULL PRIMARY KEY) ENGINE=InnoDB;
INSERT INTO acct_k(k) VALUES (1),(2),(3);

-- tx index per account: 1..50
CREATE TABLE tx_k (tn TINYINT NOT NULL PRIMARY KEY) ENGINE=InnoDB;
INSERT INTO tx_k(tn)
SELECT (t.d*10 + o.d) + 1
FROM digits t
CROSS JOIN digits o
WHERE (t.d*10 + o.d) < 50;

-- Map account_seq -> (account_id, client_id) once (30,000 rows)
CREATE TABLE acct_map (
  account_seq INT NOT NULL PRIMARY KEY,
  account_id  VARCHAR(20) NOT NULL,
  client_id   VARCHAR(20) NOT NULL,
  KEY idx_am_account (account_id),
  KEY idx_am_client (client_id)
) ENGINE=InnoDB;

INSERT INTO acct_map (account_seq, account_id, client_id)
SELECT
  ((c.n - 1) * 3 + ak.k) AS account_seq,
  CONCAT('ACC', LPAD(((c.n - 1) * 3 + ak.k), 6, '0')) AS account_id,
  CONCAT('CLT', LPAD(c.n, 5, '0')) AS client_id
FROM (
  SELECT (a.d*1000 + b.d*100 + c.d*10 + e.d) + 1 AS n
  FROM digits a
  CROSS JOIN digits b
  CROSS JOIN digits c
  CROSS JOIN digits e
  WHERE (a.d*1000 + b.d*100 + c.d*10 + e.d) < 10000
) c
CROSS JOIN acct_k ak;

-- =====================================================
-- DATA INSERTS
-- =====================================================

START TRANSACTION;

-- USERS: Admins
INSERT INTO users (id, first_name, last_name, email, role) VALUES
('ADM001_ROOT','System','Administrator','admin@crm.com','Admin'),
('ADM002','Amelia','Lim','amelia.lim@crm.com','Admin'),
('ADM003','Daniel','Lee','daniel.lee@crm.com','Admin'),
('ADM004','Sofia','Ng','sofia.ng@crm.com','Admin'),
('ADM005','Ryan','Wong','ryan.wong@crm.com','Admin');

-- USERS: 100 Agents (meaningful names; AGT001 email fixed)
INSERT INTO users (id, first_name, last_name, email, role)
SELECT
  CONCAT('AGT', LPAD(n,3,'0')) AS id,
  ELT(1 + MOD(n-1, 20),
      'Aiden','Amelia','Benjamin','Chloe','Daniel',
      'Ethan','Grace','Hannah','Isaac','Jasmine',
      'Kai','Liam','Maya','Noah','Olivia',
      'Ryan','Sophia','Tara','Wei','Zara'
  ) AS first_name,
  ELT(1 + MOD(n*3-1, 20),
      'Tan','Lim','Lee','Ng','Wong',
      'Goh','Chua','Teo','Ong','Koh',
      'Yeo','Ho','Chan','Lau','Sim',
      'Neo','Low','Seah','Ang','Toh'
  ) AS last_name,
  CASE
    WHEN n = 1 THEN 'agent1@crm.com'
    ELSE CONCAT(
      LOWER(ELT(1 + MOD(n-1, 20),
          'Aiden','Amelia','Benjamin','Chloe','Daniel',
          'Ethan','Grace','Hannah','Isaac','Jasmine',
          'Kai','Liam','Maya','Noah','Olivia',
          'Ryan','Sophia','Tara','Wei','Zara'
      )),
      '.',
      LOWER(ELT(1 + MOD(n*3-1, 20),
          'Tan','Lim','Lee','Ng','Wong',
          'Goh','Chua','Teo','Ong','Koh',
          'Yeo','Ho','Chan','Lau','Sim',
          'Neo','Low','Seah','Ang','Toh'
      )),
      n,
      '@crm.com'
    )
  END AS email,
  'Agent' AS role
FROM (
  SELECT (t.d*10 + o.d) + 1 AS n
  FROM digits t
  CROSS JOIN digits o
  WHERE (t.d*10 + o.d) < 100
) n100;

-- CLIENTS: 10,000 (each agent owns 100 clients)
INSERT INTO clients (
  client_id, first_name, last_name, date_of_birth, gender,
  email_address, phone_number, address, city, state, country, postal_code, agent_id
)
SELECT
  CONCAT('CLT', LPAD(n,5,'0')) AS client_id,
  ELT(1 + MOD(n-1, 40),
      'Aiden','Amelia','Arjun','Ava','Benjamin','Chloe','Daniel','Ethan','Grace','Hannah',
      'Ivy','James','Jia','Kai','Liam','Lucas','Maya','Noah','Olivia','Ryan',
      'Sofia','Tara','Wei','Xavier','Yuna','Zara','Anya','Bryan','Carmen','Dylan',
      'Evelyn','Fiona','Gavin','Harper','Isla','Jasper','Keira','Luca','Mei','Nina'
  ) AS first_name,
  ELT(1 + MOD(n*7-1, 24),
      'Tan','Lim','Lee','Ng','Wong','Goh','Chua','Teo','Ong','Koh','Yeo','Ho',
      'Chan','Lau','Kwan','Toh','Ang','Sim','Neo','Seah','Chew','Low','Pang','Quek'
  ) AS last_name,
  DATE_SUB(DATE_SUB(CURDATE(), INTERVAL 18 YEAR), INTERVAL MOD(CRC32(CONCAT('dob:', n)), (82*365)) DAY) AS date_of_birth,
  ELT(1 + MOD(n-1, 4), 'Male','Female','Non-binary','Prefer not to say') AS gender,
  CONCAT(
    LOWER(ELT(1 + MOD(n-1, 40),
      'Aiden','Amelia','Arjun','Ava','Benjamin','Chloe','Daniel','Ethan','Grace','Hannah',
      'Ivy','James','Jia','Kai','Liam','Lucas','Maya','Noah','Olivia','Ryan',
      'Sofia','Tara','Wei','Xavier','Yuna','Zara','Anya','Bryan','Carmen','Dylan',
      'Evelyn','Fiona','Gavin','Harper','Isla','Jasper','Keira','Luca','Mei','Nina'
    )),
    '.',
    LOWER(ELT(1 + MOD(n*7-1, 24),
      'Tan','Lim','Lee','Ng','Wong','Goh','Chua','Teo','Ong','Koh','Yeo','Ho',
      'Chan','Lau','Kwan','Toh','Ang','Sim','Neo','Seah','Chew','Low','Pang','Quek'
    )),
    n,
    '@crm.com'
  ) AS email_address,
  CONCAT('+65', LPAD(80000000 + n, 8, '0')) AS phone_number,
  CONCAT(
    'Blk ', 1 + MOD(n, 999), ' ',
    ELT(1 + MOD(n-1, 9),
        'Orchard Rd','Clementi Ave','Bishan St','Tampines Ave','Jurong East St',
        'Serangoon Ave','Bukit Timah Rd','Ang Mo Kio Ave','Bedok North Rd'
    ),
    ' #', LPAD(1 + MOD(n, 50), 2, '0'), '-', LPAD(1 + MOD(n*7, 40), 2, '0')
  ) AS address,
  'Singapore','Singapore','Singapore',
  LPAD(100000 + MOD(n*13, 900000), 6, '0') AS postal_code,
  CONCAT('AGT', LPAD(1 + FLOOR((n-1)/100), 3, '0')) AS agent_id
FROM (
  SELECT (a.d*1000 + b.d*100 + c.d*10 + e.d) + 1 AS n
  FROM digits a
  CROSS JOIN digits b
  CROSS JOIN digits c
  CROSS JOIN digits e
  WHERE (a.d*1000 + b.d*100 + c.d*10 + e.d) < 10000
) n10000;

-- ACCOUNTS: 3 per client => 30,000 accounts
-- Account types per client (k=1..3): Savings, Savings, Checking
-- Account ID pattern: ACC000001..ACC030000 (6 digits)
INSERT INTO accounts (
  account_id, client_id, account_type, account_status, opening_date,
  initial_deposit, currency, branch_id
)
SELECT
  CONCAT('ACC', LPAD(((c.n - 1) * 3 + ak.k), 6, '0')) AS account_id,
  CONCAT('CLT', LPAD(c.n, 5, '0')) AS client_id,
  ELT(ak.k, 'Savings','Savings','Checking') AS account_type,
  ELT(1 + MOD(((c.n - 1) * 3 + ak.k) - 1, 10),
      'Active','Active','Active','Active','Active','Active','Active','Inactive','Pending','Active'
  ) AS account_status,
  DATE_SUB(CURDATE(), INTERVAL MOD(((c.n - 1) * 3 + ak.k) * 17, 365 * 5) DAY) AS opening_date,
  ROUND(
    100 + MOD(CRC32(CONCAT('dep:', c.n, ':', ak.k)), 49900)
    + (MOD(CRC32(CONCAT('cents:', c.n, ':', ak.k)), 100) / 100),
    2
  ) AS initial_deposit,
  'SGD' AS currency,
  CONCAT('BR', LPAD(1 + MOD(((c.n - 1) * 3 + ak.k) - 1, 30), 3, '0')) AS branch_id
FROM (
  SELECT (a.d*1000 + b.d*100 + c.d*10 + e.d) + 1 AS n
  FROM digits a
  CROSS JOIN digits b
  CROSS JOIN digits c
  CROSS JOIN digits e
  WHERE (a.d*1000 + b.d*100 + c.d*10 + e.d) < 10000
) c
CROSS JOIN acct_k ak;

COMMIT;

-- =====================================================
-- TRANSACTIONS: 50 per account => 1,500,000
-- 10 batches, 3,000 accounts each
-- Each statement inserts 3,000 * 50 = 150,000 rows
-- =====================================================

START TRANSACTION;

-- Batch 01: account_seq 1 - 3000
INSERT INTO transactions (id, account_id, client_id, transaction_type, amount, `date`, status)
SELECT
  CONCAT('TX', LPAD(((am.account_seq - 1) * 50 + tk.tn), 8, '0')) AS id,
  am.account_id,
  am.client_id,
  CASE WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 20) < 11 THEN 'D' ELSE 'W' END AS transaction_type,
  ROUND(10 + MOD(CRC32(CONCAT('amt:', am.account_seq, ':', tk.tn)), 999991) / 100, 2) AS amount,
  DATE_SUB(CURDATE(), INTERVAL MOD(((am.account_seq - 1) * 50 + tk.tn) * 3, 365) DAY) AS `date`,
  CASE
    WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 100) < 90 THEN 'Completed'
    WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 100) < 96 THEN 'Pending'
    ELSE 'Failed'
  END AS status
FROM acct_map am
CROSS JOIN tx_k tk
WHERE am.account_seq BETWEEN 1 AND 3000;

-- Batch 02: 3001 - 6000
INSERT INTO transactions (id, account_id, client_id, transaction_type, amount, `date`, status)
SELECT
  CONCAT('TX', LPAD(((am.account_seq - 1) * 50 + tk.tn), 8, '0')),
  am.account_id, am.client_id,
  CASE WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 20) < 11 THEN 'D' ELSE 'W' END,
  ROUND(10 + MOD(CRC32(CONCAT('amt:', am.account_seq, ':', tk.tn)), 999991) / 100, 2),
  DATE_SUB(CURDATE(), INTERVAL MOD(((am.account_seq - 1) * 50 + tk.tn) * 3, 365) DAY),
  CASE
    WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 100) < 90 THEN 'Completed'
    WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 100) < 96 THEN 'Pending'
    ELSE 'Failed'
  END
FROM acct_map am CROSS JOIN tx_k tk
WHERE am.account_seq BETWEEN 3001 AND 6000;

-- Batch 03: 6001 - 9000
INSERT INTO transactions (id, account_id, client_id, transaction_type, amount, `date`, status)
SELECT CONCAT('TX', LPAD(((am.account_seq - 1) * 50 + tk.tn), 8, '0')),
       am.account_id, am.client_id,
       CASE WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 20) < 11 THEN 'D' ELSE 'W' END,
       ROUND(10 + MOD(CRC32(CONCAT('amt:', am.account_seq, ':', tk.tn)), 999991) / 100, 2),
       DATE_SUB(CURDATE(), INTERVAL MOD(((am.account_seq - 1) * 50 + tk.tn) * 3, 365) DAY),
       CASE
         WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 100) < 90 THEN 'Completed'
         WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 100) < 96 THEN 'Pending'
         ELSE 'Failed'
       END
FROM acct_map am CROSS JOIN tx_k tk
WHERE am.account_seq BETWEEN 6001 AND 9000;

-- Batch 04: 9001 - 12000
INSERT INTO transactions (id, account_id, client_id, transaction_type, amount, `date`, status)
SELECT CONCAT('TX', LPAD(((am.account_seq - 1) * 50 + tk.tn), 8, '0')),
       am.account_id, am.client_id,
       CASE WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 20) < 11 THEN 'D' ELSE 'W' END,
       ROUND(10 + MOD(CRC32(CONCAT('amt:', am.account_seq, ':', tk.tn)), 999991) / 100, 2),
       DATE_SUB(CURDATE(), INTERVAL MOD(((am.account_seq - 1) * 50 + tk.tn) * 3, 365) DAY),
       CASE
         WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 100) < 90 THEN 'Completed'
         WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 100) < 96 THEN 'Pending'
         ELSE 'Failed'
       END
FROM acct_map am CROSS JOIN tx_k tk
WHERE am.account_seq BETWEEN 9001 AND 12000;

-- Batch 05: 12001 - 15000
INSERT INTO transactions (id, account_id, client_id, transaction_type, amount, `date`, status)
SELECT CONCAT('TX', LPAD(((am.account_seq - 1) * 50 + tk.tn), 8, '0')),
       am.account_id, am.client_id,
       CASE WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 20) < 11 THEN 'D' ELSE 'W' END,
       ROUND(10 + MOD(CRC32(CONCAT('amt:', am.account_seq, ':', tk.tn)), 999991) / 100, 2),
       DATE_SUB(CURDATE(), INTERVAL MOD(((am.account_seq - 1) * 50 + tk.tn) * 3, 365) DAY),
       CASE
         WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 100) < 90 THEN 'Completed'
         WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 100) < 96 THEN 'Pending'
         ELSE 'Failed'
       END
FROM acct_map am CROSS JOIN tx_k tk
WHERE am.account_seq BETWEEN 12001 AND 15000;

-- Batch 06: 15001 - 18000
INSERT INTO transactions (id, account_id, client_id, transaction_type, amount, `date`, status)
SELECT CONCAT('TX', LPAD(((am.account_seq - 1) * 50 + tk.tn), 8, '0')),
       am.account_id, am.client_id,
       CASE WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 20) < 11 THEN 'D' ELSE 'W' END,
       ROUND(10 + MOD(CRC32(CONCAT('amt:', am.account_seq, ':', tk.tn)), 999991) / 100, 2),
       DATE_SUB(CURDATE(), INTERVAL MOD(((am.account_seq - 1) * 50 + tk.tn) * 3, 365) DAY),
       CASE
         WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 100) < 90 THEN 'Completed'
         WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 100) < 96 THEN 'Pending'
         ELSE 'Failed'
       END
FROM acct_map am CROSS JOIN tx_k tk
WHERE am.account_seq BETWEEN 15001 AND 18000;

-- Batch 07: 18001 - 21000
INSERT INTO transactions (id, account_id, client_id, transaction_type, amount, `date`, status)
SELECT CONCAT('TX', LPAD(((am.account_seq - 1) * 50 + tk.tn), 8, '0')),
       am.account_id, am.client_id,
       CASE WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 20) < 11 THEN 'D' ELSE 'W' END,
       ROUND(10 + MOD(CRC32(CONCAT('amt:', am.account_seq, ':', tk.tn)), 999991) / 100, 2),
       DATE_SUB(CURDATE(), INTERVAL MOD(((am.account_seq - 1) * 50 + tk.tn) * 3, 365) DAY),
       CASE
         WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 100) < 90 THEN 'Completed'
         WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 100) < 96 THEN 'Pending'
         ELSE 'Failed'
       END
FROM acct_map am CROSS JOIN tx_k tk
WHERE am.account_seq BETWEEN 18001 AND 21000;

-- Batch 08: 21001 - 24000
INSERT INTO transactions (id, account_id, client_id, transaction_type, amount, `date`, status)
SELECT CONCAT('TX', LPAD(((am.account_seq - 1) * 50 + tk.tn), 8, '0')),
       am.account_id, am.client_id,
       CASE WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 20) < 11 THEN 'D' ELSE 'W' END,
       ROUND(10 + MOD(CRC32(CONCAT('amt:', am.account_seq, ':', tk.tn)), 999991) / 100, 2),
       DATE_SUB(CURDATE(), INTERVAL MOD(((am.account_seq - 1) * 50 + tk.tn) * 3, 365) DAY),
       CASE
         WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 100) < 90 THEN 'Completed'
         WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 100) < 96 THEN 'Pending'
         ELSE 'Failed'
       END
FROM acct_map am CROSS JOIN tx_k tk
WHERE am.account_seq BETWEEN 21001 AND 24000;

-- Batch 09: 24001 - 27000
INSERT INTO transactions (id, account_id, client_id, transaction_type, amount, `date`, status)
SELECT CONCAT('TX', LPAD(((am.account_seq - 1) * 50 + tk.tn), 8, '0')),
       am.account_id, am.client_id,
       CASE WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 20) < 11 THEN 'D' ELSE 'W' END,
       ROUND(10 + MOD(CRC32(CONCAT('amt:', am.account_seq, ':', tk.tn)), 999991) / 100, 2),
       DATE_SUB(CURDATE(), INTERVAL MOD(((am.account_seq - 1) * 50 + tk.tn) * 3, 365) DAY),
       CASE
         WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 100) < 90 THEN 'Completed'
         WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 100) < 96 THEN 'Pending'
         ELSE 'Failed'
       END
FROM acct_map am CROSS JOIN tx_k tk
WHERE am.account_seq BETWEEN 24001 AND 27000;

-- Batch 10: 27001 - 30000
INSERT INTO transactions (id, account_id, client_id, transaction_type, amount, `date`, status)
SELECT CONCAT('TX', LPAD(((am.account_seq - 1) * 50 + tk.tn), 8, '0')),
       am.account_id, am.client_id,
       CASE WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 20) < 11 THEN 'D' ELSE 'W' END,
       ROUND(10 + MOD(CRC32(CONCAT('amt:', am.account_seq, ':', tk.tn)), 999991) / 100, 2),
       DATE_SUB(CURDATE(), INTERVAL MOD(((am.account_seq - 1) * 50 + tk.tn) * 3, 365) DAY),
       CASE
         WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 100) < 90 THEN 'Completed'
         WHEN MOD(((am.account_seq - 1) * 50 + tk.tn), 100) < 96 THEN 'Pending'
         ELSE 'Failed'
       END
FROM acct_map am CROSS JOIN tx_k tk
WHERE am.account_seq BETWEEN 27001 AND 30000;

COMMIT;

-- =====================================================
-- LOGS:
-- Base: 2 per client (Create + Update) => 20,000
-- Plus realistic Reads:
--   + Client profile view: 10,000
--   + Account overview view: 30,000 (1 per account)
--   + Transaction history view: 30,000 (1 per account)
-- Total logs: 90,000
-- =====================================================

START TRANSACTION;

-- Create (Client) 10,000
INSERT INTO logs (crud, entity_type, attribute_name, before_value, after_value, agent_id, client_id, `datetime`)
SELECT
  'Create','Client','ClientID','','Created',
  CONCAT('AGT', LPAD(1 + FLOOR((n-1)/100), 3, '0')),
  CONCAT('CLT', LPAD(n, 5, '0')),
  CONCAT(DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(), INTERVAL MOD(n*29, 43200) MINUTE), '%Y-%m-%dT%H:%i:%s'), 'Z')
FROM (
  SELECT (a.d*1000 + b.d*100 + c.d*10 + e.d) + 1 AS n
  FROM digits a
  CROSS JOIN digits b
  CROSS JOIN digits c
  CROSS JOIN digits e
  WHERE (a.d*1000 + b.d*100 + c.d*10 + e.d) < 10000
) n10000;

-- Update (Client) 10,000
INSERT INTO logs (crud, entity_type, attribute_name, before_value, after_value, agent_id, client_id, `datetime`)
SELECT
  'Update','Client','First Name|Address',
  CONCAT(
    ELT(1 + MOD(n-1, 40),
        'Aiden','Amelia','Arjun','Ava','Benjamin','Chloe','Daniel','Ethan','Grace','Hannah',
        'Ivy','James','Jia','Kai','Liam','Lucas','Maya','Noah','Olivia','Ryan',
        'Sofia','Tara','Wei','Xavier','Yuna','Zara','Anya','Bryan','Carmen','Dylan',
        'Evelyn','Fiona','Gavin','Harper','Isla','Jasper','Keira','Luca','Mei','Nina'
    ),
    '|Blk ', 1 + MOD(n, 999), ' ',
    ELT(1 + MOD(n-1, 9),
        'Orchard Rd','Clementi Ave','Bishan St','Tampines Ave','Jurong East St',
        'Serangoon Ave','Bukit Timah Rd','Ang Mo Kio Ave','Bedok North Rd'
    )
  ),
  CONCAT(
    ELT(1 + MOD(n-1, 40),
        'Aiden','Amelia','Arjun','Ava','Benjamin','Chloe','Daniel','Ethan','Grace','Hannah',
        'Ivy','James','Jia','Kai','Liam','Lucas','Maya','Noah','Olivia','Ryan',
        'Sofia','Tara','Wei','Xavier','Yuna','Zara','Anya','Bryan','Carmen','Dylan',
        'Evelyn','Fiona','Gavin','Harper','Isla','Jasper','Keira','Luca','Mei','Nina'
    ),
    '|Blk ', 1 + MOD(n, 999), ' ',
    ELT(1 + MOD(n-1, 9),
        'Orchard Rd','Clementi Ave','Bishan St','Tampines Ave','Jurong East St',
        'Serangoon Ave','Bukit Timah Rd','Ang Mo Kio Ave','Bedok North Rd'
    ),
    ' (Updated)'
  ),
  CONCAT('AGT', LPAD(1 + FLOOR((n-1)/100), 3, '0')),
  CONCAT('CLT', LPAD(n, 5, '0')),
  CONCAT(DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(), INTERVAL MOD(n*31, 43200) MINUTE), '%Y-%m-%dT%H:%i:%s'), 'Z')
FROM (
  SELECT (a.d*1000 + b.d*100 + c.d*10 + e.d) + 1 AS n
  FROM digits a
  CROSS JOIN digits b
  CROSS JOIN digits c
  CROSS JOIN digits e
  WHERE (a.d*1000 + b.d*100 + c.d*10 + e.d) < 10000
) n10000;

-- Read (Client profile view) 10,000
INSERT INTO logs (crud, entity_type, attribute_name, before_value, after_value, agent_id, client_id, `datetime`)
SELECT
  'Read','Client','ClientProfile','','Viewed',
  CONCAT('AGT', LPAD(1 + FLOOR((n-1)/100), 3, '0')),
  CONCAT('CLT', LPAD(n, 5, '0')),
  CONCAT(DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(), INTERVAL MOD(n*7, 43200) MINUTE), '%Y-%m-%dT%H:%i:%s'), 'Z')
FROM (
  SELECT (a.d*1000 + b.d*100 + c.d*10 + e.d) + 1 AS n
  FROM digits a
  CROSS JOIN digits b
  CROSS JOIN digits c
  CROSS JOIN digits e
  WHERE (a.d*1000 + b.d*100 + c.d*10 + e.d) < 10000
) n10000;

-- Read (Account overview view) 30,000 (1 per account)
INSERT INTO logs (crud, entity_type, attribute_name, before_value, after_value, agent_id, client_id, `datetime`)
SELECT
  'Read','Account','AccountOverview','','Viewed',
  CONCAT('AGT', LPAD(1 + FLOOR((c.n-1)/100), 3, '0')),
  CONCAT('CLT', LPAD(c.n, 5, '0')),
  CONCAT(DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(), INTERVAL MOD(((c.n-1)*3+ak.k)*5, 43200) MINUTE), '%Y-%m-%dT%H:%i:%s'), 'Z')
FROM (
  SELECT (a.d*1000 + b.d*100 + c.d*10 + e.d) + 1 AS n
  FROM digits a
  CROSS JOIN digits b
  CROSS JOIN digits c
  CROSS JOIN digits e
  WHERE (a.d*1000 + b.d*100 + c.d*10 + e.d) < 10000
) c
CROSS JOIN acct_k ak;

-- Read (Transaction history view) 30,000 (1 per account)
INSERT INTO logs (crud, entity_type, attribute_name, before_value, after_value, agent_id, client_id, `datetime`)
SELECT
  'Read','Transaction','TransactionHistory','','Viewed',
  CONCAT('AGT', LPAD(1 + FLOOR((c.n-1)/100), 3, '0')),
  CONCAT('CLT', LPAD(c.n, 5, '0')),
  CONCAT(DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(), INTERVAL MOD(((c.n-1)*3+ak.k)*11, 43200) MINUTE), '%Y-%m-%dT%H:%i:%s'), 'Z')
FROM (
  SELECT (a.d*1000 + b.d*100 + c.d*10 + e.d) + 1 AS n
  FROM digits a
  CROSS JOIN digits b
  CROSS JOIN digits c
  CROSS JOIN digits e
  WHERE (a.d*1000 + b.d*100 + c.d*10 + e.d) < 10000
) c
CROSS JOIN acct_k ak;

COMMIT;

-- =====================================================
-- SANITY CHECKS (uncomment)
-- =====================================================
-- SELECT role, COUNT(*) FROM users GROUP BY role;
-- SELECT COUNT(*) AS clients_cnt FROM clients;                 -- 10000
-- SELECT COUNT(*) AS accounts_cnt FROM accounts;               -- 30000
-- SELECT COUNT(*) AS tx_cnt FROM transactions;                 -- 1500000
-- SELECT COUNT(*) AS logs_cnt FROM logs;                       -- 90000
-- SELECT agent_id, COUNT(*) c FROM clients GROUP BY agent_id HAVING c <> 100;  -- should be 0 rows
-- SELECT client_id, COUNT(*) c FROM accounts GROUP BY client_id HAVING c <> 3; -- should be 0 rows
-- SELECT account_id, COUNT(*) c FROM transactions GROUP BY account_id HAVING c <> 50; -- should be 0 rows

-- =====================================================
-- OPTIONAL CLEANUP (uncomment)
-- =====================================================
-- DROP TABLE acct_map;
-- DROP TABLE tx_k;
-- DROP TABLE acct_k;
-- DROP TABLE digits;