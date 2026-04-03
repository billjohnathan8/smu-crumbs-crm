# Troubleshooting

## Python command not found

- Windows PowerShell: use `python`, not `python3`.
- Linux/macOS/WSL: use `python3`.
- If missing, follow [prerequisites/PYTHON-REQUIREMENT.md](prerequisites/PYTHON-REQUIREMENT.md).

## Setup script fails fast on missing tools

`scripts/pipelines/setup_dev_env.py` validates prerequisites first.
Install the missing tool, then rerun setup.

Check status quickly:

```bash
python scripts/pipelines/setup_dev_env.py --doctor
```

## `sudo` failures in WSL

Use your WSL account password (not your Windows PIN).
If needed, reset it:

```powershell
wsl -u root
passwd <your_wsl_username>
```

## Fullstack tests fail to start

Symptoms usually include failed health checks for gateway or LocalStack.

1. Ensure Docker is running.
2. Re-run `bash scripts/ci/run-fullstack-integration-e2e.sh`.
3. Check logs in `build-logs/fullstack-integration/`.

## Local dev stack fails to start

If `bash scripts/dev/stack-up.sh` fails:

1. Ensure Docker is running.
2. Check `build-logs/dev-stack/docker-build.log` for Docker image build errors.
3. Tear down any leftover containers before retrying: `bash scripts/dev/stack-down.sh`.
4. Re-run `bash scripts/dev/stack-up.sh`.

## Too many stopped containers / disk usage growing

LocalStack spawns a container per Lambda invocation. After repeated pipeline runs these accumulate (visible in Docker Desktop as many `crm-fullstack-it-local-localstack-1-lamb…` entries).

Quick fix:

```bash
docker container prune
```

Targeted removal (Lambda containers only):

```bash
docker rm $(docker ps -a -q --filter "ancestor=lambda/python:3.12" --filter "status=exited")
```

See [infrastructure/localstack-setup.md](infrastructure/localstack-setup.md#7-cleaning-up-leftover-lambda-containers) for the full cleanup reference.

## Terraform apply fails with existing Route53 record or Secrets Manager pending deletion

Symptoms:
- `InvalidChangeBatch: Tried to create resource record set ... but it already exists`
- `You can't create this secret because a secret with this name is already scheduled for deletion`

Fix from `platform/terraform`:

```bash
# 1) Optional but required when secrets are stuck in pending deletion
bash scripts/force-delete-stale-resources.sh prod

# 2) Import pre-existing Route53/secrets and other managed resources into state
bash scripts/reconcile-existing-resources.sh prod

# 3) Re-run plan/apply
terraform plan -var-file="env/prod.tfvars" -var-file="runtime.auto.tfvars" -out=tfplan
terraform apply -auto-approve tfplan
```

Notes:
- Replace `prod` with `lab` as needed.
- Ensure `AWS_REGION` is set (`ap-southeast-1` for prod, `us-east-1` for lab) before running scripts.
