#!/usr/bin/env python3
"""Build deterministic Lambda zip artifacts required by Terraform.

Why this exists:
- Terraform computes `source_code_hash` from local zip bytes.
- Non-deterministic zips (mtime metadata, platform attributes) can differ
  between plan and apply runs, causing inconsistent final plan errors.
"""

from __future__ import annotations

from pathlib import Path
import stat
import zipfile


ROOT = Path(__file__).resolve().parents[2]

ARTIFACTS: list[tuple[str, str]] = [
    ("services/backend/log/lambda_function.py", "services/backend/log/log-lambda.zip"),
    ("services/backend/aml/lambda_function.py", "services/backend/aml/aml-lambda.zip"),
    (
        "services/backend/sftp-transaction-collector/lambda_function.py",
        "services/backend/sftp-transaction-collector/sftp-transaction-collector.zip",
    ),
    (
        "services/backend/audit-consumer/lambda_function.py",
        "services/backend/audit-consumer/audit-consumer-lambda.zip",
    ),
    (
        "services/backend/aml-consumer/lambda_function.py",
        "services/backend/aml-consumer/aml-consumer-lambda.zip",
    ),
    (
        "services/backend/verification/lambda_function.py",
        "services/backend/verification/verification-lambda.zip",
    ),
]


def write_deterministic_zip(source_rel: str, zip_rel: str) -> None:
    source_path = ROOT / source_rel
    zip_path = ROOT / zip_rel

    if not source_path.is_file():
        raise FileNotFoundError(f"Missing Lambda source file: {source_path}")

    zip_path.parent.mkdir(parents=True, exist_ok=True)
    content = source_path.read_bytes()

    zip_info = zipfile.ZipInfo(filename="lambda_function.py")
    zip_info.date_time = (1980, 1, 1, 0, 0, 0)
    zip_info.compress_type = zipfile.ZIP_DEFLATED
    zip_info.create_system = 3  # Unix
    zip_info.external_attr = (stat.S_IFREG | 0o644) << 16

    with zipfile.ZipFile(zip_path, mode="w") as zf:
        zf.writestr(zip_info, content)

    if zip_path.stat().st_size == 0:
        raise ValueError(f"Lambda zip artifact is empty: {zip_path}")


def main() -> None:
    for source_rel, zip_rel in ARTIFACTS:
        write_deterministic_zip(source_rel, zip_rel)
        print(f"Built {zip_rel}")


if __name__ == "__main__":
    main()
