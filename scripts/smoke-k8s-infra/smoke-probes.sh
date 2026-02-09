#!/usr/bin/env bash
# smoke-probes.sh â€” Probe-aware smoke checks for Kubernetes workloads.
#
# Validates:
#   1. Rollout readiness (${KUBECTL} rollout status) for every Deployment in the
#      app namespace before any HTTP checks run.
#   2. Probe presence: every container has readinessProbe + livenessProbe;
#      workloads listed in startup-probe-required.txt also need startupProbe.
#   3. In-cluster health: runs an ephemeral curl pod to hit every HTTP probe
#      endpoint from inside the cluster.
#   4. On failure, prints detailed diagnostics (pods, describe, events, logs).
#
# Usage:
#   bash scripts/smoke-k8s-infra/smoke-probes.sh [NAMESPACE]
#   NAMESPACE defaults to "dev".

set -euo pipefail

# Source common environment setup
source "$(dirname "${BASH_SOURCE[0]}")/../common/setup-env.sh"

NAMESPACE="${1:-dev}"
ROLLOUT_TIMEOUT="${ROLLOUT_TIMEOUT:-300s}"
CURL_IMAGE="${CURL_IMAGE:-curlimages/curl:8.5.0}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
startup_required_file="${script_dir}/startup-probe-required.txt"

# Use commands from common setup
KUBECTL="${KUBECTL_CMD}"

errors=()
failed_deployments=()

# Enhanced failure tracking with categorization
declare -a rollout_failures=()
declare -a probe_presence_failures=()
declare -a incluster_health_failures=()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
header() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()     { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fail()   { printf '  \033[31m✗\033[0m %s\n' "$*"; errors+=("$*"); }
warn()   { printf '  \033[33m⚠\033[0m %s\n' "$*"; }

record_rollout_failure() {
  local resource="$1"
  local detail="$2"
  local output="$3"
  rollout_failures+=("RESOURCE:${resource}|DETAIL:${detail}|OUTPUT:${output}")
}

record_probe_presence_failure() {
  local resource="$1"
  local container="$2"
  local probe_type="$3"
  local detail="$4"
  probe_presence_failures+=("RESOURCE:${resource}|CONTAINER:${container}|PROBE:${probe_type}|DETAIL:${detail}")
}

record_incluster_health_failure() {
  local endpoint="$1"
  local status_code="$2"
  local detail="$3"
  local diagnostics="$4"
  incluster_health_failures+=("ENDPOINT:${endpoint}|STATUS:${status_code}|DETAIL:${detail}|DIAG:${diagnostics}")
}

# ---------------------------------------------------------------------------
# Load startup-probe-required list
# ---------------------------------------------------------------------------
declare -A startup_required
if [[ -f "${startup_required_file}" ]]; then
  while IFS= read -r line; do
    line="${line%%#*}"       # strip comments
    line="${line// /}"       # strip spaces
    [[ -z "${line}" ]] && continue
    startup_required["${line}"]=1
  done < "${startup_required_file}"
fi

# ---------------------------------------------------------------------------
# 1) Rollout gating
# ---------------------------------------------------------------------------
header "Rollout gating (namespace: ${NAMESPACE}, timeout: ${ROLLOUT_TIMEOUT})"

deployments="$(${KUBECTL} -n "${NAMESPACE}" get deployments -o jsonpath='{.items[*].metadata.name}')"
if [[ -z "${deployments}" ]]; then
  fail "No Deployments found in namespace ${NAMESPACE}"
else
  for deploy in ${deployments}; do
    rollout_output=$(${KUBECTL} -n "${NAMESPACE}" rollout status "deployment/${deploy}" --timeout="${ROLLOUT_TIMEOUT}" 2>&1 || true)
    if ${KUBECTL} -n "${NAMESPACE}" rollout status "deployment/${deploy}" --timeout="${ROLLOUT_TIMEOUT}" >/dev/null 2>&1; then
      ok "deployment/${deploy} rolled out"
    else
      fail "deployment/${deploy} rollout timed out or failed"
      failed_deployments+=("${deploy}")
      record_rollout_failure "deployment/${deploy}" "Rollout timed out or failed" "${rollout_output}"
      echo "${rollout_output}"
    fi
  done
fi

# Also check StatefulSets if any exist
statefulsets="$(${KUBECTL} -n "${NAMESPACE}" get statefulsets -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || true)"
if [[ -n "${statefulsets}" ]]; then
  for sts in ${statefulsets}; do
    rollout_output=$(${KUBECTL} -n "${NAMESPACE}" rollout status "statefulset/${sts}" --timeout="${ROLLOUT_TIMEOUT}" 2>&1 || true)
    if ${KUBECTL} -n "${NAMESPACE}" rollout status "statefulset/${sts}" --timeout="${ROLLOUT_TIMEOUT}" >/dev/null 2>&1; then
      ok "statefulset/${sts} rolled out"
    else
      fail "statefulset/${sts} rollout timed out or failed"
      record_rollout_failure "statefulset/${sts}" "Rollout timed out or failed" "${rollout_output}"
      echo "${rollout_output}"
    fi
  done
fi

# If rollout failed, dump diagnostics immediately
if [[ ${#failed_deployments[@]} -gt 0 ]]; then
  header "Rollout failure diagnostics"
  ${KUBECTL} get pods -n "${NAMESPACE}" -o wide 2>&1 || true
  echo "---"
  ${KUBECTL} describe pods -n "${NAMESPACE}" 2>&1 || true
  echo "---"
  ${KUBECTL} get events -n "${NAMESPACE}" --sort-by=.metadata.creationTimestamp 2>&1 | tail -200 || true
  for deploy in "${failed_deployments[@]}"; do
    echo "--- logs for deployment/${deploy} ---"
    ${KUBECTL} -n "${NAMESPACE}" logs "deployment/${deploy}" --all-containers --tail=80 2>&1 || true
  done
  echo ""
  echo "FAIL: Rollout gating failed. Aborting smoke."
  exit 1
fi

# ---------------------------------------------------------------------------
# 2) Probe presence assertions
# ---------------------------------------------------------------------------
header "Probe presence assertions (namespace: ${NAMESPACE})"

# Get all Deployments as JSON
deploy_json="$(${KUBECTL} -n "${NAMESPACE}" get deployments -o json)"
deploy_count="$(echo "${deploy_json}" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items']))" 2>/dev/null || echo 0)"

for idx in $(seq 0 $((deploy_count - 1))); do
  deploy_name="$(echo "${deploy_json}" | python3 -c "import sys,json; print(json.load(sys.stdin)['items'][${idx}]['metadata']['name'])")"
  container_count="$(echo "${deploy_json}" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items'][${idx}]['spec']['template']['spec']['containers']))")"

  for cidx in $(seq 0 $((container_count - 1))); do
    container_name="$(echo "${deploy_json}" | python3 -c "import sys,json; print(json.load(sys.stdin)['items'][${idx}]['spec']['template']['spec']['containers'][${cidx}]['name'])")"
    container_json="$(echo "${deploy_json}" | python3 -c "import sys,json,json as j; print(j.dumps(json.load(sys.stdin)['items'][${idx}]['spec']['template']['spec']['containers'][${cidx}]))")"

    has_readiness="$(echo "${container_json}" | python3 -c "import sys,json; c=json.load(sys.stdin); print('yes' if 'readinessProbe' in c else 'no')")"
    has_liveness="$(echo "${container_json}" | python3 -c "import sys,json; c=json.load(sys.stdin); print('yes' if 'livenessProbe' in c else 'no')")"
    has_startup="$(echo "${container_json}" | python3 -c "import sys,json; c=json.load(sys.stdin); print('yes' if 'startupProbe' in c else 'no')")"

    if [[ "${has_readiness}" == "yes" ]]; then
      ok "Deployment/${deploy_name} container=${container_name}: readinessProbe present"
    else
      fail "Deployment/${deploy_name} container=${container_name}: MISSING readinessProbe"
      record_probe_presence_failure "Deployment/${deploy_name}" "${container_name}" "readinessProbe" "Missing readinessProbe"
    fi

    if [[ "${has_liveness}" == "yes" ]]; then
      ok "Deployment/${deploy_name} container=${container_name}: livenessProbe present"
    else
      fail "Deployment/${deploy_name} container=${container_name}: MISSING livenessProbe"
      record_probe_presence_failure "Deployment/${deploy_name}" "${container_name}" "livenessProbe" "Missing livenessProbe"
    fi

    # startupProbe â€” required only for workloads in the allowlist
    if [[ -n "${startup_required[Deployment/${deploy_name}]:-}" ]]; then
      if [[ "${has_startup}" == "yes" ]]; then
        ok "Deployment/${deploy_name} container=${container_name}: startupProbe present (required)"
      else
        fail "Deployment/${deploy_name} container=${container_name}: MISSING startupProbe (required by startup-probe-required.txt)"
        record_probe_presence_failure "Deployment/${deploy_name}" "${container_name}" "startupProbe" "Missing required startupProbe"
      fi
    else
      if [[ "${has_startup}" == "yes" ]]; then
        ok "Deployment/${deploy_name} container=${container_name}: startupProbe present (optional)"
      else
        warn "Deployment/${deploy_name} container=${container_name}: no startupProbe (not required)"
      fi
    fi
  done
done

# Also check StatefulSets
sts_json="$(${KUBECTL} -n "${NAMESPACE}" get statefulsets -o json 2>/dev/null || echo '{"items":[]}')"
sts_count="$(echo "${sts_json}" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items']))" 2>/dev/null || echo 0)"

for idx in $(seq 0 $((sts_count - 1))); do
  sts_name="$(echo "${sts_json}" | python3 -c "import sys,json; print(json.load(sys.stdin)['items'][${idx}]['metadata']['name'])")"
  container_count="$(echo "${sts_json}" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items'][${idx}]['spec']['template']['spec']['containers']))")"

  for cidx in $(seq 0 $((container_count - 1))); do
    container_name="$(echo "${sts_json}" | python3 -c "import sys,json; print(json.load(sys.stdin)['items'][${idx}]['spec']['template']['spec']['containers'][${cidx}]['name'])")"
    container_json="$(echo "${sts_json}" | python3 -c "import sys,json,json as j; print(j.dumps(json.load(sys.stdin)['items'][${idx}]['spec']['template']['spec']['containers'][${cidx}]))")"

    has_readiness="$(echo "${container_json}" | python3 -c "import sys,json; c=json.load(sys.stdin); print('yes' if 'readinessProbe' in c else 'no')")"
    has_liveness="$(echo "${container_json}" | python3 -c "import sys,json; c=json.load(sys.stdin); print('yes' if 'livenessProbe' in c else 'no')")"
    has_startup="$(echo "${container_json}" | python3 -c "import sys,json; c=json.load(sys.stdin); print('yes' if 'startupProbe' in c else 'no')")"

    if [[ "${has_readiness}" == "yes" ]]; then
      ok "StatefulSet/${sts_name} container=${container_name}: readinessProbe present"
    else
      fail "StatefulSet/${sts_name} container=${container_name}: MISSING readinessProbe"
      record_probe_presence_failure "StatefulSet/${sts_name}" "${container_name}" "readinessProbe" "Missing readinessProbe"
    fi
    if [[ "${has_liveness}" == "yes" ]]; then
      ok "StatefulSet/${sts_name} container=${container_name}: livenessProbe present"
    else
      fail "StatefulSet/${sts_name} container=${container_name}: MISSING livenessProbe"
      record_probe_presence_failure "StatefulSet/${sts_name}" "${container_name}" "livenessProbe" "Missing livenessProbe"
    fi
    if [[ -n "${startup_required[StatefulSet/${sts_name}]:-}" ]]; then
      if [[ "${has_startup}" == "yes" ]]; then
        ok "StatefulSet/${sts_name} container=${container_name}: startupProbe present (required)"
      else
        fail "StatefulSet/${sts_name} container=${container_name}: MISSING startupProbe (required by startup-probe-required.txt)"
        record_probe_presence_failure "StatefulSet/${sts_name}" "${container_name}" "startupProbe" "Missing required startupProbe"
      fi
    fi
  done
done

# ---------------------------------------------------------------------------
# 3) In-cluster probe endpoint health checks
# ---------------------------------------------------------------------------
header "In-cluster probe health checks (namespace: ${NAMESPACE})"

# Build a list of HTTP probe endpoints to test from the live workload specs.
# Format: <service-name> <port-value> <path>
# We resolve named ports to their numeric containerPort values.
declare -a probe_checks=()

for idx in $(seq 0 $((deploy_count - 1))); do
  deploy_name="$(echo "${deploy_json}" | python3 -c "import sys,json; print(json.load(sys.stdin)['items'][${idx}]['metadata']['name'])")"
  # Extract all probe HTTP endpoints and container port mappings using a single python3 call
  probe_entries="$(echo "${deploy_json}" | python3 -c "
import sys, json
items = json.load(sys.stdin)['items']
deploy = items[${idx}]
deploy_name = deploy['metadata']['name']
containers = deploy['spec']['template']['spec']['containers']
for c in containers:
    # Build port name->number map
    port_map = {}
    for p in c.get('ports', []):
        if 'name' in p:
            port_map[p['name']] = p['containerPort']
        port_map[str(p['containerPort'])] = p['containerPort']

    for probe_type in ('readinessProbe', 'livenessProbe', 'startupProbe'):
        probe = c.get(probe_type)
        if not probe:
            continue
        http_get = probe.get('httpGet')
        if http_get:
            path = http_get.get('path', '/')
            raw_port = http_get.get('port', 80)
            if isinstance(raw_port, str):
                port = port_map.get(raw_port, raw_port)
            else:
                port = raw_port
            print(f'{deploy_name} {c[\"name\"]} {probe_type} {port} {path}')
        elif 'tcpSocket' in probe:
            raw_port = probe['tcpSocket'].get('port', 0)
            if isinstance(raw_port, str):
                port = port_map.get(raw_port, raw_port)
            else:
                port = raw_port
            print(f'{deploy_name} {c[\"name\"]} {probe_type} {port} TCP')
        elif 'exec' in probe:
            print(f'{deploy_name} {c[\"name\"]} {probe_type} 0 EXEC')
" 2>/dev/null || true)"

  while IFS= read -r entry; do
    [[ -z "${entry}" ]] && continue
    probe_checks+=("${entry}")
  done <<< "${probe_entries}"
done

# Deduplicate: we only need to test each unique (service, port, path) once
declare -A seen_endpoints=()
declare -a unique_curl_checks=()

for entry in "${probe_checks[@]}"; do
  read -r deploy_name container_name probe_type port path <<< "${entry}"

  if [[ "${path}" == "TCP" ]]; then
    warn "${deploy_name}/${container_name} ${probe_type}: tcpSocket probe â€” TCP connect check via ephemeral pod"
    key="${deploy_name}:${port}:TCP"
    if [[ -z "${seen_endpoints[${key}]:-}" ]]; then
      seen_endpoints["${key}"]=1
      unique_curl_checks+=("TCP ${deploy_name} ${port}")
    fi
    continue
  fi

  if [[ "${path}" == "EXEC" ]]; then
    warn "${deploy_name}/${container_name} ${probe_type}: exec probe â€” not HTTP-testable, skipping"
    continue
  fi

  key="${deploy_name}:${port}:${path}"
  if [[ -z "${seen_endpoints[${key}]:-}" ]]; then
    seen_endpoints["${key}"]=1
    unique_curl_checks+=("HTTP ${deploy_name} ${port} ${path}")
  fi
done

# Determine the k8s service name for each deployment.
# Convention in this repo: the service name matches the deployment name (e.g., agent-service for agent).
# We read actual Service objects to be safe.
svc_json="$(${KUBECTL} -n "${NAMESPACE}" get services -o json 2>/dev/null || echo '{"items":[]}')"

resolve_service_for_deploy() {
  local deploy_name="$1"
  # Try exact match first: "<deploy_name>-service", then "<deploy_name>"
  for candidate in "${deploy_name}-service" "${deploy_name}"; do
    local found
    found="$(echo "${svc_json}" | python3 -c "
import sys, json
items = json.load(sys.stdin)['items']
for s in items:
    if s['metadata']['name'] == '${candidate}':
        print(s['metadata']['name'])
        break
" 2>/dev/null || true)"
    if [[ -n "${found}" ]]; then
      echo "${found}"
      return
    fi
  done
  # Fallback: find service whose selector matches app=<deploy_name>
  local fallback
  fallback="$(echo "${svc_json}" | python3 -c "
import sys, json
items = json.load(sys.stdin)['items']
for s in items:
    sel = s.get('spec', {}).get('selector', {})
    if sel.get('app') == '${deploy_name}':
        print(s['metadata']['name'])
        break
" 2>/dev/null || true)"
  echo "${fallback}"
}

# Get the Service port for a given service name and target port (containerPort).
# This is needed because Services expose different ports than containers.
# e.g., Service port 80 -> containerPort 8080
get_service_port_for_target() {
  local svc_name="$1"
  local target_port="$2"
  local svc_port
  svc_port="$(echo "${svc_json}" | python3 -c "
import sys, json
items = json.load(sys.stdin)['items']
target = '${target_port}'
svc_name = '${svc_name}'
for s in items:
    if s['metadata']['name'] == svc_name:
        for p in s.get('spec', {}).get('ports', []):
            tp = p.get('targetPort')
            # targetPort can be int or string (named port)
            if str(tp) == target or (p.get('name') and p.get('name') == target):
                print(p.get('port', target))
                sys.exit(0)
            # Also match if targetPort is 'http' and target is 8080 (common pattern)
            if tp == 'http' and target == '8080':
                print(p.get('port', target))
                sys.exit(0)
        break
# Fallback to target port if no mapping found
print(target)
" 2>/dev/null || echo "${target_port}")"
  echo "${svc_port}"
}

# Run the ephemeral curl pod checks
if [[ ${#unique_curl_checks[@]} -gt 0 ]]; then
  # Build a shell script to run inside the ephemeral pod
  check_script="#!/bin/sh
set -e
PASS=0
FAIL=0
"
  for check in "${unique_curl_checks[@]}"; do
    read -r check_type deploy_name port_or_rest <<< "${check}"
    svc_name="$(resolve_service_for_deploy "${deploy_name}")"
    if [[ -z "${svc_name}" ]]; then
      warn "No Service found for deployment/${deploy_name}; skipping in-cluster check"
      continue
    fi

    if [[ "${check_type}" == "TCP" ]]; then
      container_port="${port_or_rest}"
      # Map containerPort to Service port
      port="$(get_service_port_for_target "${svc_name}" "${container_port}")"
      check_script+="
echo \"TCP ${svc_name}:${port}\"
if curl -sS --connect-timeout 5 --max-time 10 telnet://${svc_name}.${NAMESPACE}.svc.cluster.local:${port} </dev/null 2>/dev/null; then
  echo \"  PASS (TCP)\"
  PASS=\$((PASS+1))
else
  # curl telnet may not work; try plain connect via /dev/tcp equivalent
  if wget -q --spider --timeout=5 \"http://${svc_name}.${NAMESPACE}.svc.cluster.local:${port}/\" 2>/dev/null; then
    echo \"  PASS (TCP via wget)\"
    PASS=\$((PASS+1))
  else
    echo \"  NOTE: TCP connect check inconclusive for ${svc_name}:${port} (non-HTTP probe)\"
  fi
fi
"
    else
      # HTTP check with enhanced diagnostics
      read -r container_port path <<< "${port_or_rest}"
      # Map containerPort to Service port
      port="$(get_service_port_for_target "${svc_name}" "${container_port}")"
      check_script+="
echo \"HTTP ${svc_name}:${port}${path}\"
STATUS=\$(curl -sS --connect-timeout 5 --max-time 10 -o /dev/null -w '%{http_code}' \"http://${svc_name}.${NAMESPACE}.svc.cluster.local:${port}${path}\" 2>/dev/null || echo 000)
if [ \"\${STATUS}\" -ge 200 ] 2>/dev/null && [ \"\${STATUS}\" -lt 300 ] 2>/dev/null; then
  echo \"  PASS (HTTP \${STATUS})\"
  PASS=\$((PASS+1))
else
  echo \"  FAIL (HTTP \${STATUS})\"
  echo \"  Failed endpoint diagnostics:\"
  RESPONSE_HEADERS=\$(curl -sS --connect-timeout 5 --max-time 10 -i \"http://${svc_name}.${NAMESPACE}.svc.cluster.local:${port}${path}\" 2>&1 | head -20)
  echo \"  Response headers/body (first 20 lines):\"
  echo \"\${RESPONSE_HEADERS}\" | sed 's/^/    /'
  echo \"  ---\"
  FAIL=\$((FAIL+1))
fi
"
    fi
  done

  check_script+='
echo ""
echo "In-cluster probe checks: ${PASS} passed, ${FAIL} failed"
if [ "${FAIL}" -gt 0 ]; then
  exit 1
fi
'

  # Run ephemeral pod
  echo "Launching ephemeral curl pod for in-cluster probe checks..."
  pod_name="smoke-probe-check-$$"
  if ${KUBECTL} run "${pod_name}" \
      --namespace="${NAMESPACE}" \
      --image="${CURL_IMAGE}" \
      --restart=Never \
      --rm \
      -i \
      --command -- /bin/sh -c "${check_script}" 2>&1; then
    ok "All in-cluster probe endpoint checks passed"
  else
    fail "One or more in-cluster probe endpoint checks failed"
  fi
  # Clean up pod if it wasn't auto-removed
  ${KUBECTL} delete pod "${pod_name}" --namespace="${NAMESPACE}" --ignore-not-found --wait=false 2>/dev/null || true
else
  warn "No probe endpoints to check in-cluster"
fi

# ---------------------------------------------------------------------------
# 4) Summary & diagnostics on failure
# ---------------------------------------------------------------------------
if [[ ${#errors[@]} -gt 0 ]]; then
  header "FAILURE DIAGNOSTICS (namespace: ${NAMESPACE})"
  
  # Generate structured failure summary
  echo ""
  echo "--- FAILURE SUMMARY ---"
  echo "Total failures: ${#errors[@]}"
  
  # Rollout failures
  if [[ ${#rollout_failures[@]} -gt 0 ]]; then
    echo ""
    printf '\033[31mROLLOUT FAILURES (%d):\033[0m\n' "${#rollout_failures[@]}"
    for failure in "${rollout_failures[@]}"; do
      IFS='|' read -r resource detail output <<< "${failure}"
      resource="${resource#RESOURCE:}"
      detail="${detail#DETAIL:}"
      output="${output#OUTPUT:}"
      printf '  \033[33mResource: %s\033[0m\n' "${resource}"
      echo "    Detail: ${detail}"
      if [[ -n "${output}" ]]; then
        echo "    Output:"
        echo "${output}" | sed 's/^/      /'
      fi
    done
  fi
  
  # Probe presence failures
  if [[ ${#probe_presence_failures[@]} -gt 0 ]]; then
    echo ""
    printf '\033[31mPROBE PRESENCE FAILURES (%d):\033[0m\n' "${#probe_presence_failures[@]}"
    for failure in "${probe_presence_failures[@]}"; do
      IFS='|' read -r resource container probe detail <<< "${failure}"
      resource="${resource#RESOURCE:}"
      container="${container#CONTAINER:}"
      probe="${probe#PROBE:}"
      detail="${detail#DETAIL:}"
      printf '  \033[33mResource: %s\033[0m\n' "${resource}"
      echo "    Container: ${container}"
      echo "    Missing Probe: ${probe}"
      echo "    Detail: ${detail}"
    done
  fi
  
  # In-cluster health failures
  if [[ ${#incluster_health_failures[@]} -gt 0 ]]; then
    echo ""
    printf '\033[31mIN-CLUSTER HEALTH FAILURES (%d):\033[0m\n' "${#incluster_health_failures[@]}"
    for failure in "${incluster_health_failures[@]}"; do
      IFS='|' read -r endpoint status detail diag <<< "${failure}"
      endpoint="${endpoint#ENDPOINT:}"
      status="${status#STATUS:}"
      detail="${detail#DETAIL:}"
      diag="${diag#DIAG:}"
      printf '  \033[33mEndpoint: %s\033[0m\n' "${endpoint}"
      echo "    Status Code: ${status}"
      echo "    Detail: ${detail}"
      if [[ -n "${diag}" ]]; then
        echo "    Diagnostics:"
        echo "${diag}" | sed 's/^/      /'
      fi
    done
  fi
  
  echo ""
  echo "--- pods ---"
  ${KUBECTL} get pods -n "${NAMESPACE}" -o wide 2>&1 || true
  echo ""
  echo "--- describe pods ---"
  ${KUBECTL} describe pods -n "${NAMESPACE}" 2>&1 || true
  echo ""
  echo "--- events (last 200) ---"
  ${KUBECTL} get events -n "${NAMESPACE}" --sort-by=.metadata.creationTimestamp 2>&1 | tail -200 || true
  echo ""
  echo "--- logs (tail) for deployments ---"
  for deploy in ${deployments}; do
    echo "=== deployment/${deploy} ==="
    ${KUBECTL} -n "${NAMESPACE}" logs "deployment/${deploy}" --all-containers --tail=60 2>&1 || true
  done
  echo ""
  
  # Export structured failure data to JSON for consumption by CI/CD
  if [[ -n "${BUILD_LOG_FILE:-}" ]]; then
    log_dir="$(dirname "${BUILD_LOG_FILE}")"
    failure_report_path="${log_dir}/probe-failures.json"
    
    # Build JSON structure (simple approach without jq dependency)
    cat > "${failure_report_path}" <<EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "namespace": "${NAMESPACE}",
  "totalFailures": ${#errors[@]},
  "failuresByCategory": {
    "rollout": ${#rollout_failures[@]},
    "probePresence": ${#probe_presence_failures[@]},
    "inClusterHealth": ${#incluster_health_failures[@]}
  },
  "errors": [
EOF
    
    for i in "${!errors[@]}"; do
      error_escaped="$(echo "${errors[$i]}" | sed 's/\\/\\\\/g; s/"/\\"/g')"
      if [[ $i -lt $((${#errors[@]} - 1)) ]]; then
        echo "    \"${error_escaped}\"," >> "${failure_report_path}"
      else
        echo "    \"${error_escaped}\"" >> "${failure_report_path}"
      fi
    done
    
    echo "  ]" >> "${failure_report_path}"
    echo "}" >> "${failure_report_path}"
    
    printf '\033[36mDetailed failure report saved to: %s\033[0m\n' "${failure_report_path}"
  fi
  
  header "PROBE SMOKE FAILED"
  echo "Errors:"
  for e in "${errors[@]}"; do
    echo "  - ${e}"
  done
  exit 1
fi

header "Probe-aware smoke checks passed"
