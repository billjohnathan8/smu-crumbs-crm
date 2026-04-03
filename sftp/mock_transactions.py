#!/usr/bin/env python3
"""
Generate mock transaction CSV files for the transaction ingestion flow.

Contract-aligned output columns:
- legacy: clientId,transaction,amount,date,status
- aml: transaction_id,client_id,transaction_type,amount,date,status
"""

from __future__ import annotations

import argparse
import csv
import random
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path


LEGACY_CSV_HEADER = ["clientId", "transaction", "amount", "date", "status"]
AML_CSV_HEADER = [
    "transaction_id",
    "client_id",
    "transaction_type",
    "amount",
    "date",
    "status",
]
STATUS_VALUES = ("Completed", "Pending", "Failed")


@dataclass(frozen=True)
class TransactionProfile:
    name: str
    kind: str
    min_amount: float
    max_amount: float
    weight: int
    status_weights: tuple[int, int, int] = (86, 11, 3)  # Completed, Pending, Failed


PROFILES: tuple[TransactionProfile, ...] = (
    TransactionProfile("salary_credit", "D", 1800.00, 9000.00, 12, (97, 3, 0)),
    TransactionProfile("cash_deposit", "D", 60.00, 2400.00, 10),
    TransactionProfile("transfer_in", "D", 20.00, 5000.00, 14),
    TransactionProfile("refund", "D", 5.00, 650.00, 8, (92, 6, 2)),
    TransactionProfile("interest_credit", "D", 1.00, 120.00, 5, (99, 1, 0)),
    TransactionProfile("atm_withdrawal", "W", 20.00, 1200.00, 13),
    TransactionProfile("card_purchase", "W", 2.00, 650.00, 20, (82, 14, 4)),
    TransactionProfile("bill_payment", "W", 25.00, 2600.00, 9),
    TransactionProfile("transfer_out", "W", 15.00, 7000.00, 8),
    TransactionProfile("bank_fee", "W", 1.00, 60.00, 1, (100, 0, 0)),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate contract-aligned mock transactions CSV for S3/mock-SFTP ingestion."
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("mocked_transactions.csv"),
        help="Output CSV path (default: mocked_transactions.csv).",
    )
    parser.add_argument(
        "--row-count",
        type=int,
        default=120,
        help="Number of valid rows to generate (default: 120).",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Random seed for deterministic output.",
    )
    parser.add_argument(
        "--start-transaction-id",
        type=int,
        default=1,
        help="Starting synthetic transaction sequence number (default: 1).",
    )
    parser.add_argument(
        "--start-date",
        type=date.fromisoformat,
        default=date(2026, 1, 1),
        help="Inclusive start date YYYY-MM-DD (default: 2026-01-01).",
    )
    parser.add_argument(
        "--end-date",
        type=date.fromisoformat,
        default=date(2026, 3, 31),
        help="Inclusive end date YYYY-MM-DD (default: 2026-03-31).",
    )
    parser.add_argument(
        "--client-id-mode",
        choices=("pool", "sequential"),
        default="pool",
        help="How client IDs are assigned (default: pool).",
    )
    parser.add_argument(
        "--client-ids",
        type=str,
        default="",
        help="Comma-separated client IDs for pool mode (example: clt_1,clt_2).",
    )
    parser.add_argument(
        "--client-id-count",
        type=int,
        default=20,
        help="Client pool size when not passing --client-ids (default: 20).",
    )
    parser.add_argument(
        "--include-edge-cases",
        action="store_true",
        help="Append a few intentionally invalid rows for negative testing.",
    )
    parser.add_argument(
        "--schema",
        choices=("legacy", "aml"),
        default="legacy",
        help="CSV schema to emit (default: legacy).",
    )
    args = parser.parse_args()
    if args.row_count < 1:
        parser.error("--row-count must be >= 1")
    if args.start_transaction_id < 1:
        parser.error("--start-transaction-id must be >= 1")
    if args.client_id_count < 1:
        parser.error("--client-id-count must be >= 1")
    if args.end_date < args.start_date:
        parser.error("--end-date must be on or after --start-date")
    return args


def build_client_pool(args: argparse.Namespace) -> list[str]:
    if args.client_ids.strip():
        pool = [value.strip() for value in args.client_ids.split(",") if value.strip()]
        if not pool:
            raise ValueError("No valid IDs found in --client-ids")
        return pool
    return [f"clt_{index}" for index in range(1, args.client_id_count + 1)]


def choose_status(rng: random.Random, profile: TransactionProfile) -> str:
    return rng.choices(STATUS_VALUES, weights=profile.status_weights, k=1)[0]


def pick_client_id(
    rng: random.Random,
    client_pool: list[str],
    mode: str,
    tx_sequence: int,
) -> str:
    if mode == "sequential":
        pool_size = len(client_pool)
        return client_pool[(tx_sequence - 1) % pool_size]
    return rng.choice(client_pool)


def pick_transaction_date(rng: random.Random, start: date, end: date) -> date:
    day_count = (end - start).days
    return start + timedelta(days=rng.randint(0, day_count))


def generate_valid_rows(args: argparse.Namespace, rng: random.Random) -> list[dict[str, str]]:
    client_pool = build_client_pool(args)
    profiles = list(PROFILES)
    profile_weights = [profile.weight for profile in profiles]
    rows: list[dict[str, str]] = []
    for offset in range(args.row_count):
        tx_sequence = args.start_transaction_id + offset
        profile = rng.choices(profiles, weights=profile_weights, k=1)[0]
        amount_value = round(rng.uniform(profile.min_amount, profile.max_amount), 2)
        tx_date = pick_transaction_date(rng, args.start_date, args.end_date)
        status = choose_status(rng, profile)
        client_id = pick_client_id(rng, client_pool, args.client_id_mode, tx_sequence)
        rows.append(
            {
                "transaction_id": f"TXN{tx_sequence:08d}",
                "client_id": client_id,
                "transaction_type": profile.kind,
                "amount": f"{amount_value:.2f}",
                "date": tx_date.isoformat(),
                "status": status,
            }
        )
    rows.sort(
        key=lambda row: (
            row["date"],
            row["client_id"],
            row["transaction_type"],
            row["amount"],
        )
    )
    return rows


def edge_case_rows() -> list[dict[str, str]]:
    return [
        {
            "transaction_id": "TXNEDGE0001",
            "client_id": "",
            "transaction_type": "D",
            "amount": "100.00",
            "date": "2026-02-01",
            "status": "Completed",
        },  # missing client_id
        {
            "transaction_id": "TXNEDGE0002",
            "client_id": "clt_edge",
            "transaction_type": "X",
            "amount": "200.00",
            "date": "2026-02-02",
            "status": "Completed",
        },  # invalid transaction_type
        {
            "transaction_id": "TXNEDGE0003",
            "client_id": "clt_edge",
            "transaction_type": "W",
            "amount": "-50.00",
            "date": "2026-02-03",
            "status": "Pending",
        },  # negative amount
        {
            "transaction_id": "TXNEDGE0004",
            "client_id": "clt_edge",
            "transaction_type": "D",
            "amount": "75.00",
            "date": "2026/02/04",
            "status": "Completed",
        },  # invalid date format
        {
            "transaction_id": "TXNEDGE0005",
            "client_id": "clt_edge",
            "transaction_type": "D",
            "amount": "75.00",
            "date": "2026-02-05",
            "status": "Unknown",
        },  # invalid status
    ]


def serialise_rows(rows: list[dict[str, str]], schema: str) -> tuple[list[str], list[list[str]]]:
    if schema == "aml":
        header = AML_CSV_HEADER
        serialised = [[row[column] for column in header] for row in rows]
        return header, serialised

    header = LEGACY_CSV_HEADER
    serialised = [
        [
            row["client_id"],
            row["transaction_type"],
            row["amount"],
            row["date"],
            row["status"],
        ]
        for row in rows
    ]
    return header, serialised


def write_csv(path: Path, rows: list[dict[str, str]], schema: str) -> None:
    header, serialised = serialise_rows(rows, schema)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as output:
        writer = csv.writer(output)
        writer.writerow(header)
        writer.writerows(serialised)


def main() -> None:
    args = parse_args()
    rng = random.Random(args.seed)
    rows = generate_valid_rows(args, rng)
    if args.include_edge_cases:
        rows.extend(edge_case_rows())
    write_csv(args.output, rows, args.schema)
    print(f"Wrote {len(rows)} rows to {args.output} (schema={args.schema})")


if __name__ == "__main__":
    main()
