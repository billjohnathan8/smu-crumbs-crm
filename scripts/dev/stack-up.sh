#!/usr/bin/env bash
# scripts/dev/stack-up.sh
#
# Start the full local dev stack and leave it running.
# Runs health checks only — no business assertions, no Playwright.
#
# Usage (from repo root):
#   bash scripts/dev/stack-up.sh
#
# Teardown:
#   bash scripts/dev/stack-down.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/scripts/ci/fullstack-integration.compose.yml"
COMPOSE_PROJECT="crm-fullstack-it-local"
LOG_DIR="${ROOT_DIR}/build-logs/dev-stack"
LOCALSTACK_ENDPOINT="http://127.0.0.1:14566"
LOG_LAMBDA_NAME="scroogebank-crm-dev-log-service"
LOG_HTTP_API_NAME="scroogebank-crm-dev-log-http-api-dev"
LOG_HTTP_API_STAGE="local"
LOG_LAMBDA_RUNTIME="python3.12"
VERIFICATION_LAMBDA_NAME="scroogebank-crm-dev-verification"
VERIFICATION_SNS_TOPIC_NAME="scroogebank-crm-dev-verification"
VERIFICATION_LAMBDA_RUNTIME="python3.12"
TRANSACTION_INGESTION_LAMBDA_NAME="scroogebank-crm-dev-transaction-ingestion"
TRANSACTION_INGESTION_LAMBDA_RUNTIME="python3.12"

export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=ap-southeast-1
export AWS_PAGER=""
export LOCAL_DB_HOST=postgres
export LOCAL_DB_PORT=5432
export LOCAL_DB_NAME="${LOCAL_DB_NAME:-crm}"
export LOCAL_DB_USER="${LOCAL_DB_USER:-crm_app}"
export LOCAL_DB_PASSWORD="${LOCAL_DB_PASSWORD:-devpassword}"

mkdir -p "${LOG_DIR}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

detect_python() {
  if command -v python3 >/dev/null 2>&1 && python3 -c "import sys; sys.exit(0)" 2>/dev/null; then
    echo "python3"
  elif command -v python >/dev/null 2>&1 && python -c "import sys; sys.exit(0)" 2>/dev/null; then
    echo "python"
  else
    echo "[FAIL] No working Python interpreter found (python3 or python)" >&2
    exit 1
  fi
}

detect_aws() {
  if command -v aws >/dev/null 2>&1; then echo "aws"
  elif command -v aws.exe >/dev/null 2>&1; then echo "aws.exe"
  elif [ -x "/mnt/c/Program Files/Amazon/AWSCLIV2/aws.exe" ]; then
    echo "/mnt/c/Program Files/Amazon/AWSCLIV2/aws.exe"
  else
    echo "[FAIL] AWS CLI not found" >&2; exit 1
  fi
}

PYTHON_CMD="$(detect_python)"
AWS_CMD="$(detect_aws)"

aws_local() {
  "${AWS_CMD}" --endpoint-url "${LOCALSTACK_ENDPOINT}" --region ap-southeast-1 "$@"
}

wait_for_http() {
  local url="$1" name="$2" attempts="${3:-60}"
  for i in $(seq 1 "${attempts}"); do
    if curl --silent --fail "${url}" >/dev/null 2>&1; then
      echo "[OK] ${name}"
      return 0
    fi
    sleep 2
  done
  echo "[FAIL] ${name} not ready: ${url}" >&2
  exit 1
}

build_jar() {
  local svc_dir="$1" name="$2"
  local log="${LOG_DIR}/build-${name}.log"
  echo "  Building ${name}..."
  pushd "${svc_dir}" >/dev/null
  # WSL on Windows filesystem: Windows java.exe (found via WSL interop) cannot
  # interpret /mnt/c/... paths, so fall through to cmd.exe/gradlew.bat instead.
  local is_wsl_win=false
  if grep -qi microsoft /proc/version 2>/dev/null && [[ "$(pwd)" == /mnt/* ]]; then
    is_wsl_win=true
  fi
  if [[ -n "${MSYSTEM:-}" ]] || [[ "${is_wsl_win}" == "true" && ! -f "./gradlew.bat" ]]; then
    # Git Bash on Windows (MSYSTEM set), or WSL but no gradlew.bat fallback
    ./gradlew bootJar --no-daemon --console=plain > "${log}" 2>&1
  elif [[ "${is_wsl_win}" == "true" ]] && command -v cmd.exe >/dev/null 2>&1 && [ -f "./gradlew.bat" ]; then
    # WSL on Windows filesystem — delegate to cmd.exe so Windows Java handles paths correctly
    cmd.exe /c "gradlew.bat bootJar --no-daemon --console=plain" > "${log}" 2>&1
  elif command -v java >/dev/null 2>&1; then
    ./gradlew bootJar --no-daemon --console=plain > "${log}" 2>&1
  elif command -v cmd.exe >/dev/null 2>&1 && [ -f "./gradlew.bat" ]; then
    cmd.exe /c "gradlew.bat bootJar --no-daemon --console=plain" > "${log}" 2>&1
  else
    echo "[FAIL] No Java/Gradle found to build ${name}" >&2; exit 1
  fi
  popd >/dev/null
  echo "  [OK] ${name} JAR built"
}

package_log_lambda() {
  local pkg_dir="${LOG_DIR}/log-lambda-package"
  local zip_path="${LOG_DIR}/log-lambda.zip"
  local pip_log="${LOG_DIR}/log-lambda-pip.log"

  rm -rf "${pkg_dir}" "${zip_path}"
  mkdir -p "${pkg_dir}"

  local python_platform
  python_platform="$(${PYTHON_CMD} -c 'import sys; print(sys.platform)' 2>/dev/null || true)"
  local lambda_python_version="${LOG_LAMBDA_RUNTIME#python}"
  [[ "${lambda_python_version}" =~ ^[0-9]+\.[0-9]+$ ]] || lambda_python_version="3.12"
  local lambda_python_abi="cp${lambda_python_version//./}"

  if [[ "${python_platform}" == "win32" ]]; then
    ${PYTHON_CMD} -m pip install \
      -r "${ROOT_DIR}/services/backend/log/requirements.txt" \
      -t "${pkg_dir}" \
      --platform manylinux2014_x86_64 \
      --implementation cp \
      --python-version "${lambda_python_version}" \
      --abi "${lambda_python_abi}" \
      --only-binary=:all: \
      > "${pip_log}" 2>&1
  else
    ${PYTHON_CMD} -m pip install \
      -r "${ROOT_DIR}/services/backend/log/requirements.txt" \
      -t "${pkg_dir}" \
      > "${pip_log}" 2>&1
  fi

  cp "${ROOT_DIR}/services/backend/log/lambda_function.py" "${pkg_dir}/"
  cp -R "${ROOT_DIR}/services/backend/log/app" "${pkg_dir}/app"

  if command -v zip >/dev/null 2>&1; then
    (cd "${pkg_dir}" && zip -rq "${zip_path}" .)
  else
    ${PYTHON_CMD} - "${pkg_dir}" "${zip_path}" <<'PY'
import pathlib, sys, zipfile
src = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2])
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    for p in src.rglob("*"):
        if p.is_file(): zf.write(p, p.relative_to(src))
PY
  fi

  echo "${LOG_DIR}/log-lambda.zip"
}

deploy_log_lambda() {
  local zip_arg
  zip_arg="$(make_zip_arg "${LOG_DIR}/log-lambda.zip")"

  local env_vars="Variables={DB_HOST=${LOCAL_DB_HOST},DB_PORT=${LOCAL_DB_PORT},DB_NAME=${LOCAL_DB_NAME},DB_USER=${LOCAL_DB_USER},DB_PASSWORD=${LOCAL_DB_PASSWORD},JWT_HMAC_SECRET=dev-only-insecure-secret,AWS_DEFAULT_REGION=ap-southeast-1,AWS_ENDPOINT_URL=http://localstack:4566,CLIENT_SERVICE_URL=http://client-service:8080}"

  if aws_local lambda get-function --function-name "${LOG_LAMBDA_NAME}" >/dev/null 2>&1; then
    aws_local lambda update-function-code \
      --function-name "${LOG_LAMBDA_NAME}" --zip-file "${zip_arg}" >/dev/null
    aws_local lambda update-function-configuration \
      --function-name "${LOG_LAMBDA_NAME}" \
      --handler lambda_function.lambda_handler \
      --runtime "${LOG_LAMBDA_RUNTIME}" \
      --timeout 30 --memory-size 512 \
      --environment "${env_vars}" >/dev/null
  else
    aws_local lambda create-function \
      --function-name "${LOG_LAMBDA_NAME}" \
      --runtime "${LOG_LAMBDA_RUNTIME}" \
      --handler lambda_function.lambda_handler \
      --zip-file "${zip_arg}" \
      --role arn:aws:iam::000000000000:role/lambda-role \
      --timeout 30 --memory-size 512 \
      --environment "${env_vars}" >/dev/null
  fi

  wait_lambda_active "${LOG_LAMBDA_NAME}"
}

provision_log_api() {
  local lambda_arn
  lambda_arn="$(aws_local lambda get-function \
    --function-name "${LOG_LAMBDA_NAME}" \
    --query Configuration.FunctionArn --output text)"
  lambda_arn="${lambda_arn%$'\r'}"

  local api_id
  # Try API Gateway v2 (HTTP API) first, fall back to v1 (REST API)
  if api_id="$(aws_local apigatewayv2 create-api \
      --name "${LOG_HTTP_API_NAME}" --protocol-type HTTP \
      --query ApiId --output text 2>/dev/null)"; then
    api_id="${api_id%$'\r'}"
    local integration_id
    integration_id="$(aws_local apigatewayv2 create-integration \
      --api-id "${api_id}" --integration-type AWS_PROXY \
      --integration-uri "${lambda_arn}" \
      --payload-format-version 2.0 \
      --query IntegrationId --output text)"
    integration_id="${integration_id%$'\r'}"
    aws_local apigatewayv2 create-route \
      --api-id "${api_id}" --route-key '$default' \
      --target "integrations/${integration_id}" >/dev/null
    aws_local apigatewayv2 create-stage \
      --api-id "${api_id}" --stage-name "${LOG_HTTP_API_STAGE}" --auto-deploy >/dev/null
  else
    echo "  [WARN] API Gateway v2 unavailable, using v1 (REST)" >&2
    api_id="$(aws_local apigateway create-rest-api \
      --name "${LOG_HTTP_API_NAME}" --query id --output text)"
    api_id="${api_id%$'\r'}"

    local root_id
    root_id="$(aws_local apigateway get-resources \
      --rest-api-id "${api_id}" \
      --query "items[?path=='/'].id | [0]" --output text)"
    root_id="${root_id%$'\r'}"

    local proxy_id
    proxy_id="$(aws_local apigateway create-resource \
      --rest-api-id "${api_id}" --parent-id "${root_id}" \
      --path-part "{proxy+}" --query id --output text)"
    proxy_id="${proxy_id%$'\r'}"

    local integration_uri="arn:aws:apigateway:ap-southeast-1:lambda:path/2015-03-31/functions/${lambda_arn}/invocations"

    for resource_id in "${root_id}" "${proxy_id}"; do
      aws_local apigateway put-method \
        --rest-api-id "${api_id}" --resource-id "${resource_id}" \
        --http-method ANY --authorization-type NONE >/dev/null
      aws_local apigateway put-integration \
        --rest-api-id "${api_id}" --resource-id "${resource_id}" \
        --http-method ANY --type AWS_PROXY --integration-http-method POST \
        --uri "${integration_uri}" >/dev/null
    done

    aws_local apigateway create-deployment \
      --rest-api-id "${api_id}" --stage-name "${LOG_HTTP_API_STAGE}" >/dev/null
  fi

  aws_local lambda add-permission \
    --function-name "${LOG_LAMBDA_NAME}" \
    --statement-id "allow-apigw-dev" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:ap-southeast-1:000000000000:${api_id}/*/*/*" \
    >/dev/null 2>&1 || true

  echo "http://localstack:4566/_aws/execute-api/${api_id}/${LOG_HTTP_API_STAGE}"
}

make_zip_arg() {
  local zip_path="$1"
  local zip_arg="fileb://${zip_path}"
  local aws_version_str
  aws_version_str="$("${AWS_CMD}" --version 2>&1 || true)"
  if echo "${aws_version_str}" | grep -qi "windows/"; then
    if command -v cygpath >/dev/null 2>&1; then
      zip_arg="fileb://$(cygpath -w "${zip_path}")"
    elif command -v wslpath >/dev/null 2>&1; then
      zip_arg="fileb://$(wslpath -w "${zip_path}")"
    fi
  fi
  echo "${zip_arg}"
}

wait_lambda_active() {
  local name="$1"
  for i in $(seq 1 40); do
    local state
    state="$(aws_local lambda get-function-configuration \
      --function-name "${name}" --query State --output text 2>/dev/null || true)"
    state="${state%$'\r'}"
    [[ "${state}" == "Active" ]] && return 0
    [[ ${i} -eq 40 ]] && { echo "[FAIL] Lambda ${name} did not become Active" >&2; exit 1; }
    sleep 1
  done
}

package_verification_lambda() {
  local pkg_dir="${LOG_DIR}/verification-lambda-package"
  local zip_path="${LOG_DIR}/verification-lambda.zip"
  rm -rf "${pkg_dir}" "${zip_path}"
  mkdir -p "${pkg_dir}"
  cp "${ROOT_DIR}/services/backend/verification/lambda_function.py" "${pkg_dir}/"
  if command -v zip >/dev/null 2>&1; then
    (cd "${pkg_dir}" && zip -rq "${zip_path}" .)
  else
    ${PYTHON_CMD} - "${pkg_dir}" "${zip_path}" <<'PY'
import pathlib, sys, zipfile
src = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2])
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    for p in src.rglob("*"):
        if p.is_file(): zf.write(p, p.relative_to(src))
PY
  fi
}

package_transaction_ingestion_lambda() {
  local pkg_dir="${LOG_DIR}/transaction-ingestion-lambda-package"
  local zip_path="${LOG_DIR}/transaction-ingestion-lambda.zip"
  rm -rf "${pkg_dir}" "${zip_path}"
  mkdir -p "${pkg_dir}"
  cp "${ROOT_DIR}/services/backend/transaction-ingestion-lambda/lambda_function.py" "${pkg_dir}/"
  if command -v zip >/dev/null 2>&1; then
    (cd "${pkg_dir}" && zip -rq "${zip_path}" .)
  else
    ${PYTHON_CMD} - "${pkg_dir}" "${zip_path}" <<'PY'
import pathlib, sys, zipfile
src = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2])
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    for p in src.rglob("*"):
        if p.is_file(): zf.write(p, p.relative_to(src))
PY
  fi
}

deploy_verification_lambda() {
  local log_service_url="$1"
  local zip_arg
  zip_arg="$(make_zip_arg "${LOG_DIR}/verification-lambda.zip")"
  # Lambdas with LAMBDA_EXECUTOR=local run inside LocalStack — use localhost, not service hostname
  local lambda_internal_log_url
  lambda_internal_log_url="$(echo "${log_service_url}" | sed 's#localstack:4566#localhost:4566#g')"
  local env_vars="Variables={LOG_API_BASE_URL=${lambda_internal_log_url},VERIFICATION_JWT_HMAC_SECRET=dev-only-insecure-secret,VERIFICATION_JWT_SUB=SYSTEM_VERIFICATION_FEEDBACK,VERIFICATION_JWT_ROLE=admin,VERIFICATION_JWT_TTL_SECONDS=300}"

  if aws_local lambda get-function --function-name "${VERIFICATION_LAMBDA_NAME}" >/dev/null 2>&1; then
    aws_local lambda update-function-code \
      --function-name "${VERIFICATION_LAMBDA_NAME}" --zip-file "${zip_arg}" >/dev/null
    aws_local lambda update-function-configuration \
      --function-name "${VERIFICATION_LAMBDA_NAME}" \
      --handler lambda_function.lambda_handler --runtime "${VERIFICATION_LAMBDA_RUNTIME}" \
      --timeout 30 --memory-size 256 --environment "${env_vars}" >/dev/null
  else
    aws_local lambda create-function \
      --function-name "${VERIFICATION_LAMBDA_NAME}" \
      --runtime "${VERIFICATION_LAMBDA_RUNTIME}" \
      --handler lambda_function.lambda_handler \
      --zip-file "${zip_arg}" \
      --role arn:aws:iam::000000000000:role/lambda-role \
      --timeout 30 --memory-size 256 --environment "${env_vars}" >/dev/null
  fi
  wait_lambda_active "${VERIFICATION_LAMBDA_NAME}"

  # Subscribe to SNS topic so email verification feedback is processed
  local topic_arn
  topic_arn="$(aws_local sns list-topics \
    --query "Topics[?contains(TopicArn, '${VERIFICATION_SNS_TOPIC_NAME}')].TopicArn | [0]" \
    --output text | tr -d '\r')"
  if [[ -n "${topic_arn}" && "${topic_arn}" != "None" ]]; then
    local lambda_arn
    lambda_arn="$(aws_local lambda get-function \
      --function-name "${VERIFICATION_LAMBDA_NAME}" \
      --query Configuration.FunctionArn --output text | tr -d '\r')"
    aws_local lambda add-permission \
      --function-name "${VERIFICATION_LAMBDA_NAME}" \
      --statement-id "allow-sns-verification-feedback" \
      --action lambda:InvokeFunction --principal sns.amazonaws.com \
      --source-arn "${topic_arn}" >/dev/null 2>&1 || true
    aws_local sns subscribe \
      --topic-arn "${topic_arn}" --protocol lambda \
      --notification-endpoint "${lambda_arn}" >/dev/null 2>&1 || true
  fi
}

deploy_transaction_ingestion_lambda() {
  local zip_arg
  zip_arg="$(make_zip_arg "${LOG_DIR}/transaction-ingestion-lambda.zip")"
  local env_vars="Variables={TRANSACTION_SFTP_BUCKET=scroogebank-crm-dev-transaction-sftp,TRANSACTION_SFTP_PREFIX=incoming/,TRANSACTION_IMPORT_URL=http://transaction-service:8080/api/transactions/import,TRANSACTION_IMPORT_JWT_HMAC_SECRET=dev-only-insecure-secret,TRANSACTION_IMPORT_JWT_SUB=SYSTEM_TRANSACTION_INGESTION,TRANSACTION_IMPORT_JWT_ROLE=admin,TRANSACTION_IMPORT_JWT_TTL_SECONDS=300}"

  if aws_local lambda get-function --function-name "${TRANSACTION_INGESTION_LAMBDA_NAME}" >/dev/null 2>&1; then
    aws_local lambda update-function-code \
      --function-name "${TRANSACTION_INGESTION_LAMBDA_NAME}" --zip-file "${zip_arg}" >/dev/null
    aws_local lambda update-function-configuration \
      --function-name "${TRANSACTION_INGESTION_LAMBDA_NAME}" \
      --handler lambda_function.lambda_handler --runtime "${TRANSACTION_INGESTION_LAMBDA_RUNTIME}" \
      --timeout 30 --memory-size 256 --environment "${env_vars}" >/dev/null
  else
    aws_local lambda create-function \
      --function-name "${TRANSACTION_INGESTION_LAMBDA_NAME}" \
      --runtime "${TRANSACTION_INGESTION_LAMBDA_RUNTIME}" \
      --handler lambda_function.lambda_handler \
      --zip-file "${zip_arg}" \
      --role arn:aws:iam::000000000000:role/lambda-role \
      --timeout 30 --memory-size 256 --environment "${env_vars}" >/dev/null
  fi
  wait_lambda_active "${TRANSACTION_INGESTION_LAMBDA_NAME}"
}

# ---------------------------------------------------------------------------
# Phase 1: Build JARs in parallel
# ---------------------------------------------------------------------------

echo ""
echo "=== Phase 1: Building backend JARs ==="
build_jar "${ROOT_DIR}/services/backend/user"        "user"        &
JAR_PID_user=$!
build_jar "${ROOT_DIR}/services/backend/client"      "client"      &
JAR_PID_client=$!
build_jar "${ROOT_DIR}/services/backend/transaction" "transaction" &
JAR_PID_transaction=$!

JAR_FAIL=false
for svc in user client transaction; do
  pid_var="JAR_PID_${svc}"
  if ! wait "${!pid_var}"; then
    echo "[FAIL] ${svc} JAR build failed. Build log:" >&2
    cat "${LOG_DIR}/build-${svc}.log" >&2
    JAR_FAIL=true
  fi
done
[[ "${JAR_FAIL}" == "true" ]] && exit 1
echo "[OK] All JARs built"

# ---------------------------------------------------------------------------
# Phase 2: Start infra + package Lambdas + pre-build Docker images (all parallel)
# ---------------------------------------------------------------------------

echo ""
echo "=== Phase 2: Starting infra + packaging Lambdas + building Docker images ==="
CLIENT_LOG_SERVICE_URL=placeholder LOG_API_UPSTREAM=placeholder \
  docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT}" up -d postgres localstack &
INFRA_PID=$!
package_log_lambda > /dev/null &
PKGLOG_PID=$!
package_verification_lambda &
PKGV_PID=$!
package_transaction_ingestion_lambda &
PKGTXN_PID=$!

# Build service images in background while LocalStack inits and lambdas deploy.
# CLIENT_LOG_SERVICE_URL / LOG_API_UPSTREAM are runtime env vars only — not build
# ARGs — so building with placeholder values produces identical images.
CLIENT_LOG_SERVICE_URL=placeholder LOG_API_UPSTREAM=placeholder \
  docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT}" build \
    user-service client-service transaction-service frontend integration-gateway \
  > "${LOG_DIR}/docker-build.log" 2>&1 &
DOCKER_BUILD_PID=$!

# Wait for infra + lambda packaging; Docker build keeps running in background.
wait $INFRA_PID $PKGLOG_PID $PKGV_PID $PKGTXN_PID
echo "[OK] Infra started, all Lambdas packaged (Docker build running in background)"

# ---------------------------------------------------------------------------
# Phase 3: Wait for LocalStack + run DB migrations
# ---------------------------------------------------------------------------

echo ""
echo "=== Phase 3: LocalStack provisioning + DB migrations ==="
wait_for_http "${LOCALSTACK_ENDPOINT}/_localstack/health" "localstack"

echo "  Waiting for LocalStack init scripts..."
for i in $(seq 1 80); do
  if aws_local sqs get-queue-url --queue-name scroogebank-crm-dev-audit >/dev/null 2>&1; then
    echo "  [OK] LocalStack init complete (attempt ${i}/80)"
    break
  fi
  [[ ${i} -eq 80 ]] && { echo "[FAIL] LocalStack init timed out" >&2; exit 1; }
  sleep 3
done

echo "  Running DB migrations..."
LOCAL_DB_HOST=postgres \
DB_DOCKER_NETWORK="${COMPOSE_PROJECT}_default" \
bash "${ROOT_DIR}/scripts/db/run-shared-postgres.sh" migrate
echo "  [OK] Migrations complete"

# ---------------------------------------------------------------------------
# Phase 4: Deploy log Lambda + provision API Gateway
# ---------------------------------------------------------------------------

echo ""
echo "=== Phase 4: Deploying Lambdas + API Gateway ==="
deploy_log_lambda
LOG_SERVICE_URL="$(provision_log_api)"
echo "[OK] Log API: ${LOCALSTACK_ENDPOINT}/_aws/execute-api/$(echo "${LOG_SERVICE_URL}" | grep -o 'execute-api/[^/]*/[^/]*' | cut -d/ -f2)/${LOG_HTTP_API_STAGE}"
# Verification and transaction ingestion lambdas are independent — deploy in parallel
deploy_verification_lambda "${LOG_SERVICE_URL}" &
VERIF_DEPLOY_PID=$!
deploy_transaction_ingestion_lambda &
TXN_DEPLOY_PID=$!
wait $VERIF_DEPLOY_PID $TXN_DEPLOY_PID
echo "[OK] Verification Lambda deployed + SNS subscribed"
echo "[OK] Transaction ingestion Lambda deployed"

# ---------------------------------------------------------------------------
# Phase 5: Start application services
# ---------------------------------------------------------------------------

echo ""
echo "=== Phase 5: Starting application services ==="
echo "  Waiting for Docker images (background build)..."
if ! wait $DOCKER_BUILD_PID; then
  echo "[FAIL] Docker image build failed — see ${LOG_DIR}/docker-build.log" >&2
  exit 1
fi
echo "[OK] Docker images built"

CLIENT_LOG_SERVICE_URL="${LOG_SERVICE_URL}" \
LOG_API_UPSTREAM="${LOG_SERVICE_URL}" \
docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT}" up -d \
  user-service client-service transaction-service frontend integration-gateway

# ---------------------------------------------------------------------------
# Phase 6: Health checks
# ---------------------------------------------------------------------------

echo ""
echo "=== Phase 6: Health checks ==="
wait_for_http "http://127.0.0.1:18081/health" "user-service"
wait_for_http "http://127.0.0.1:18082/health" "client-service"
wait_for_http "http://127.0.0.1:18083/health" "transaction-service"
wait_for_http "http://127.0.0.1:18085/health" "frontend"
wait_for_http "http://127.0.0.1:18088/health" "gateway"

# ---------------------------------------------------------------------------
# Phase 7: Seed baseline principals
# ---------------------------------------------------------------------------

echo ""
echo "=== Phase 7: Seeding baseline principals ==="
USER_BASE_URL="http://127.0.0.1:18081" \
ROOT_ADMIN_EMAIL="${E2E_ADMIN_EMAIL:-admin@crm.local}" \
ROOT_ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-Scrooge@Bank2026!}" \
SEED_USER_EMAIL="user@crm.local" \
SEED_AGENT_PASSWORD="${E2E_USER_PASSWORD:-UserPass123!}" \
bash "${ROOT_DIR}/scripts/db/run-shared-postgres.sh" seed
echo "[OK] Seeded"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

echo ""
echo "Stack is up. Services:"
echo "  app (manual test)   http://127.0.0.1:18088/login"
echo "  gateway (UI/API)    http://127.0.0.1:18088"
echo "  user-service        http://127.0.0.1:18081"
echo "  client-service      http://127.0.0.1:18082"
echo "  transaction-service http://127.0.0.1:18083"
echo "  frontend (static)   http://127.0.0.1:18085"
echo ""
echo "Root Admin Credentials:"
echo "    username:         admin@crm.local"
echo "    default_password: Scrooge@Bank2026!"
echo ""
echo "Teardown: bash scripts/dev/stack-down.sh"
