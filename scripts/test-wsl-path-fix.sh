#!/usr/bin/env bash
# test-wsl-path-fix.sh: Verify that WSL PATH fix is working correctly
set -euo pipefail

echo "========================================="
echo "WSL PATH Fix Verification"
echo "========================================="
echo ""

# Source the common setup
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/common/setup-env.sh"

echo "1. Platform Detection:"
echo "   IS_WSL: ${IS_WSL}"
echo "   IS_GIT_BASH: ${IS_GIT_BASH}"
echo "   REPO_ROOT: ${REPO_ROOT}"
echo ""

echo "2. PATH Contents:"
echo "   ${PATH}" | tr ':' '\n' | head -10
echo ""

echo "3. Tool Discovery:"
tools=(kubectl helm kind kubeconform)
for tool in "${tools[@]}"; do
    if command -v "${tool}" >/dev/null 2>&1; then
        echo "   ✅ ${tool}: $(command -v ${tool})"
    elif command -v "${tool}.exe" >/dev/null 2>&1; then
        echo "   ✅ ${tool}.exe: $(command -v ${tool}.exe)"
    else
        echo "   ❌ ${tool}: NOT FOUND"
    fi
done
echo ""

echo "4. Command Variables:"
echo "   KUBECTL_CMD: ${KUBECTL_CMD}"
echo "   HELM_CMD: ${HELM_CMD}"
echo "   KIND_CMD: ${KIND_CMD}"
echo "   KUBECONFORM_CMD: ${KUBECONFORM_CMD}"
echo ""

echo "5. Test Command Execution:"
echo "   Testing kubectl version..."
if ${KUBECTL_CMD} version --client --output=yaml >/dev/null 2>&1; then
    echo "   ✅ kubectl works"
else
    echo "   ❌ kubectl failed"
fi

echo "   Testing helm version..."
if ${HELM_CMD} version --short >/dev/null 2>&1; then
    echo "   ✅ helm works"
else
    echo "   ❌ helm failed"
fi

echo "   Testing kind version..."
if ${KIND_CMD} version >/dev/null 2>&1; then
    echo "   ✅ kind works"
else
    echo "   ❌ kind failed"
fi

echo ""
echo "========================================="
echo "Verification Complete!"
echo "========================================="
