"""
SFTP Transaction Collector Lambda.

Flow:
1. Triggered by EventBridge schedule.
2. Reads newest CSV object from an S3-backed mock ingestion bucket/prefix.
3. Calls transaction-service import endpoint with sourcePath = s3://bucket/key.

No real SFTP transport is used.

Environment variables:
    TRANSACTION_SFTP_BUCKET     Required. S3 bucket name to scan (legacy name).
    TRANSACTION_SFTP_PREFIX     Optional. Key prefix (default: incoming/) (legacy name).
    TRANSACTION_IMPORT_URL      Required. Full URL for POST /api/transactions/import.
    TRANSACTION_IMPORT_AUTH_HEADER Optional. Full Authorization header.
    TRANSACTION_IMPORT_BEARER_TOKEN Optional. Bearer token fallback.
    TRANSACTION_IMPORT_JWT_HMAC_SECRET Optional. Inline JWT HMAC secret
        for service JWT minting.
    TRANSACTION_IMPORT_JWT_HMAC_SECRET_ARN Optional. Secrets Manager ARN
        for service JWT minting.
    JWT_HMAC_SECRET_ARN         Fallback JWT secret ARN.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import time
import urllib.request
from typing import Any

import boto3

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_JWT_SECRET_CACHE: str | None = None


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _load_service_jwt_secret() -> str | None:
    global _JWT_SECRET_CACHE
    if _JWT_SECRET_CACHE:
        return _JWT_SECRET_CACHE

    inline_secret = os.environ.get("TRANSACTION_IMPORT_JWT_HMAC_SECRET", "").strip()
    if inline_secret:
        _JWT_SECRET_CACHE = inline_secret
        return _JWT_SECRET_CACHE

    secret_arn = os.environ.get("TRANSACTION_IMPORT_JWT_HMAC_SECRET_ARN", "").strip()
    if not secret_arn:
        secret_arn = os.environ.get("JWT_HMAC_SECRET_ARN", "").strip()
    if not secret_arn:
        return None

    try:
        secret_value = boto3.client("secretsmanager").get_secret_value(
            SecretId=secret_arn
        )["SecretString"]
    except Exception:
        logger.exception("Failed to load JWT secret for transaction import auth")
        return None

    if isinstance(secret_value, str) and secret_value.strip():
        _JWT_SECRET_CACHE = secret_value.strip()
    return _JWT_SECRET_CACHE


def _mint_service_jwt() -> str | None:
    secret = _load_service_jwt_secret()
    if not secret:
        return None

    now_epoch = int(time.time())
    ttl_seconds = int(os.environ.get("TRANSACTION_IMPORT_JWT_TTL_SECONDS", "300"))
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": os.environ.get(
            "TRANSACTION_IMPORT_JWT_SUB", "SYSTEM_TRANSACTION_INGESTION"
        ),
        "role": os.environ.get("TRANSACTION_IMPORT_JWT_ROLE", "service"),
        "iat": now_epoch,
        "exp": now_epoch + ttl_seconds,
    }
    header_segment = _b64url_encode(
        json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    payload_segment = _b64url_encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signing_input = f"{header_segment}.{payload_segment}"
    signature = hmac.new(
        secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256
    ).digest()
    return f"{signing_input}.{_b64url_encode(signature)}"


def _resolve_authorization_header() -> str | None:
    explicit = os.environ.get("TRANSACTION_IMPORT_AUTH_HEADER", "").strip()
    if explicit:
        return explicit
    token = os.environ.get("TRANSACTION_IMPORT_BEARER_TOKEN", "").strip()
    if token:
        return f"Bearer {token}"
    service_token = _mint_service_jwt()
    if service_token:
        return f"Bearer {service_token}"
    return None


def _latest_csv_key(bucket: str, prefix: str) -> str | None:
    s3_client = boto3.client("s3")
    paginator = s3_client.get_paginator("list_objects_v2")

    latest_key: str | None = None
    latest_timestamp = None
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj.get("Key")
            if not isinstance(key, str) or not key.lower().endswith(".csv"):
                continue
            modified = obj.get("LastModified")
            if latest_timestamp is None or (
                modified is not None and modified > latest_timestamp
            ):
                latest_timestamp = modified
                latest_key = key
    return latest_key


def _trigger_import(import_url: str, source_path: str) -> tuple[int, str]:
    payload = json.dumps({"sourcePath": source_path}).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    authorization = _resolve_authorization_header()
    if authorization:
        headers["Authorization"] = authorization

    request = urllib.request.Request(
        url=import_url,
        data=payload,
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        return response.getcode(), response.read().decode("utf-8", errors="replace")


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    bucket = os.environ.get("TRANSACTION_SFTP_BUCKET", "").strip()
    prefix = os.environ.get("TRANSACTION_SFTP_PREFIX", "incoming/").strip()
    import_url = os.environ.get("TRANSACTION_IMPORT_URL", "").strip()

    if not bucket:
        raise ValueError("TRANSACTION_SFTP_BUCKET is required")
    if not import_url:
        raise ValueError("TRANSACTION_IMPORT_URL is required")

    logger.info(
        "Transaction ingestion schedule triggered; scanning s3://%s/%s", bucket, prefix
    )
    key = _latest_csv_key(bucket, prefix)
    if not key:
        logger.info("No CSV files found in s3://%s/%s", bucket, prefix)
        return {
            "statusCode": 200,
            "body": json.dumps(
                {"message": "no_csv_files_found", "bucket": bucket, "prefix": prefix}
            ),
        }

    logger.info("Latest CSV selected: s3://%s/%s", bucket, key)
    source_path = f"s3://{bucket}/{key}"
    status_code, response_body = _trigger_import(import_url, source_path)
    logger.info("Import API response status=%s body=%s", status_code, response_body)
    return {
        "statusCode": status_code,
        "body": json.dumps(
            {
                "sourcePath": source_path,
                "importApiStatus": status_code,
                "importApiBody": response_body,
            }
        ),
    }
