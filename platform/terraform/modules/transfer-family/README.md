# SFTP Ingestion Module

This module supports EC2-hosted OpenSSH SFTP only not AWS Transfer Family.

Current ingestion contract:

`SFTP upload -> S3 bucket/prefix -> sftp-transaction-collector Lambda -> transaction import API`

## EC2 Mode Notes

- Default instance type: `t4g.micro`
- Default root disk: `8 GiB gp3`
- IAM instance profile scope: transaction S3 bucket + configured prefix only
- SSH hardened to SFTP-only (`internal-sftp`, no interactive shell)
- Security group ingress for port 22 is CIDR allowlist-driven (`sftp_ingress_cidr_blocks`)

## Outputs

- `sftp_endpoint`: active SFTP endpoint (EC2 public endpoint)
- `sftp_username`: active SFTP username
- `sftp_home_directory_target`: S3 landing path used by ingestion
