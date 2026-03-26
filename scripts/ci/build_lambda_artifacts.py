#!/usr/bin/env python3
"""Build operable lambda zip artifacts in canonical service locations."""

from __future__ import annotations

import shutil
import subprocess
import sys
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]

ARTIFACT_SPECS = [
    {
        "service_dir": ROOT_DIR / "services" / "backend" / "log",
        "zip_name": "log-lambda.zip",
        "packages": [
            "psycopg[binary]==3.2.13",
            "pydantic==2.12.5",
            "cryptography>=42.0,<46",
        ],
        "include_app": True,
    },
    {
        "service_dir": ROOT_DIR / "services" / "backend" / "verification",
        "zip_name": "verification-lambda.zip",
        "packages": ["boto3==1.38.21"],
        "include_app": False,
    },
    {
        "service_dir": ROOT_DIR / "services" / "backend" / "sftp-transaction-collector",
        "zip_name": "sftp-transaction-collector.zip",
        "packages": ["boto3==1.39.9"],
        "include_app": False,
    },
    {
        "service_dir": ROOT_DIR / "services" / "backend" / "aml",
        "zip_name": "aml-lambda.zip",
        "packages": ["paramiko==3.5.0", "cryptography==44.0.2"],
        "include_app": False,
    },
    {
        "service_dir": ROOT_DIR / "services" / "backend" / "audit-consumer",
        "zip_name": "audit-consumer-lambda.zip",
        "packages": ["boto3==1.38.21"],
        "include_app": False,
    },
]


def install_packages(target_dir: Path, packages: list[str]) -> None:
    if not packages:
        return
    cmd = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-input",
        "--target",
        str(target_dir),
        *packages,
    ]
    subprocess.run(cmd, check=True)


def zip_tree(source_dir: Path, output_zip: Path) -> None:
    with zipfile.ZipFile(output_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in source_dir.rglob("*"):
            if path.is_file():
                zf.write(path, path.relative_to(source_dir))


def build_artifact(
    service_dir: Path,
    zip_name: str,
    packages: list[str],
    include_app: bool,
) -> Path:
    build_dir = service_dir / ".lambda-build"
    output_zip = service_dir / zip_name
    shutil.rmtree(build_dir, ignore_errors=True)
    if output_zip.exists():
        output_zip.unlink()
    build_dir.mkdir(parents=True, exist_ok=True)

    install_packages(build_dir, packages)
    shutil.copy2(service_dir / "lambda_function.py", build_dir / "lambda_function.py")
    if include_app:
        shutil.copytree(service_dir / "app", build_dir / "app")

    zip_tree(build_dir, output_zip)
    shutil.rmtree(build_dir, ignore_errors=True)
    if not output_zip.exists() or output_zip.stat().st_size <= 0:
        raise RuntimeError(f"Built artifact is missing or empty: {output_zip}")
    return output_zip


def main() -> int:
    print("Building operable lambda artifacts...")
    with ThreadPoolExecutor(max_workers=len(ARTIFACT_SPECS)) as executor:
        futures = {
            executor.submit(
                build_artifact,
                spec["service_dir"],
                spec["zip_name"],
                spec["packages"],
                spec["include_app"],
            ): spec["zip_name"]
            for spec in ARTIFACT_SPECS
        }
        failed = False
        for future in as_completed(futures):
            try:
                artifact = future.result()
                print(f"[OK] {artifact}")
            except Exception as exc:
                print(f"[FAIL] {futures[future]}: {exc}")
                failed = True
    if failed:
        return 1
    print("All operable lambda artifacts are built and ready.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
