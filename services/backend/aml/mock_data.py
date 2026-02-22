"""
AML Mock Data
Scrooge Global Bank CRM - Feature 5

This module contains ONLY the raw mock data used by the local-development
mock clients inside lambda_function.py.  It has no business logic and no
custom type imports, so it stays pure-primitive and can be imported without
circular-dependency concerns.

In production these values are replaced by live data fetched from the SFTP
server, the CRM account database, and the historical-transaction store.
"""

# ---------------------------------------------------------------------------
# Mock SFTP — monthly transaction CSV
# ---------------------------------------------------------------------------
# Designed to exercise all three AML modules:
#
#   CLIENT_A  – structuring: deposits (500 + 9 800 + 9 500) within 7 days
#               sum to 19 800 SGD → Module B alert
#   CLIENT_B  – normal activity, no flags expected
#               withdrawal ratio ≈ 83 % < 90 % pass-through threshold;
#               individual amounts within CLIENT_B's own 3 σ range
#   CLIENT_C  – statistical outlier: six ~200 SGD deposits then a 50 000 SGD
#               deposit → Module A alert
#   CLIENT_D  – structuring: three deposits (5 000 + 4 800 + 4 900) within
#               3 days totalling 14 700 SGD → Module B alert
#   CLIENT_E  – pass-through (99 000 out of 100 000 in) → Module C alert;
#               account opened 2025-12, ≈1 month old → inception-spike alert
#   CLIENT_F  – normal activity, no flags expected

MOCK_CSV: str = """transaction_id,client_id,transaction_type,amount,date,status
TXN001,CLIENT_A,D,500.00,2026-01-05,Completed
TXN002,CLIENT_A,D,450.00,2026-01-06,Completed
TXN003,CLIENT_A,D,9800.00,2026-01-07,Completed
TXN004,CLIENT_A,W,200.00,2026-01-10,Completed
TXN005,CLIENT_A,D,9500.00,2026-01-08,Completed
TXN006,CLIENT_B,D,1000.00,2026-01-03,Completed
TXN007,CLIENT_B,W,900.00,2026-01-04,Completed
TXN008,CLIENT_B,D,1100.00,2026-01-11,Completed
TXN009,CLIENT_B,W,850.00,2026-01-12,Completed
TXN010,CLIENT_C,D,200.00,2026-01-02,Completed
TXN011,CLIENT_C,D,210.00,2026-01-05,Completed
TXN012,CLIENT_C,D,195.00,2026-01-08,Completed
TXN013,CLIENT_C,D,50000.00,2026-01-20,Completed
TXN014,CLIENT_D,D,5000.00,2026-01-01,Completed
TXN015,CLIENT_D,D,4800.00,2026-01-02,Completed
TXN016,CLIENT_D,D,4900.00,2026-01-03,Completed
TXN017,CLIENT_E,D,100000.00,2026-01-15,Completed
TXN018,CLIENT_E,W,99000.00,2026-01-16,Completed
TXN019,CLIENT_F,D,300.00,2026-01-01,Completed
TXN020,CLIENT_F,W,50.00,2026-01-05,Completed
"""

# ---------------------------------------------------------------------------
# Mock Account Repository — raw account data
# ---------------------------------------------------------------------------
# Each tuple: (account_id, client_id, account_type, account_status,
#              opening_date_iso, initial_deposit)
#
# CLIENT_E is intentionally young (opened 2025-12-01) so that the
# inception-spike check fires on the 2026-01 batch run.

MOCK_ACCOUNTS_DATA: list[tuple] = [
    ("ACC001", "CLIENT_A", "Savings", "Active", "2025-06-01", 5_000.0),
    ("ACC002", "CLIENT_B", "Checking", "Active", "2020-01-01", 10_000.0),
    ("ACC003", "CLIENT_C", "Savings", "Active", "2015-03-01", 2_000.0),
    ("ACC004", "CLIENT_D", "Business", "Active", "2023-05-01", 50_000.0),
    ("ACC005", "CLIENT_E", "Checking", "Active", "2025-12-01", 1_000.0),
    ("ACC006", "CLIENT_F", "Savings", "Active", "2022-08-01", 3_000.0),
]

# ---------------------------------------------------------------------------
# Mock Historical Transaction Repository — prior-month amounts per client
# ---------------------------------------------------------------------------
# Clients absent from this dict fall back to a peer-group baseline inside
# Module A.  The history for CLIENT_C is very stable so the 50 000 SGD
# deposit stands out clearly.


MOCK_HISTORY_DATA: dict[str, list[float]] = {
    # Very stable small-value history → $50 000 is a clear outlier
    "CLIENT_C": [180.0, 190.0, 200.0, 205.0, 195.0, 210.0, 185.0],
    # Mid-range deposits → $9 800 / $9 500 exceed 3 σ
    "CLIENT_A": [400.0, 450.0, 500.0, 420.0, 480.0, 510.0],
    # Stable ≈ $1 000 range → CLIENT_B's current amounts are within baseline
    "CLIENT_B": [900.0, 1100.0, 950.0, 1050.0, 980.0, 1020.0],
}
