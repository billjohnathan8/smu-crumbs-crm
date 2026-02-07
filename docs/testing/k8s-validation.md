# Kubernetes Manifest Validation Guide

This guide explains how to validate Kubernetes manifests **offline** (without a running cluster) before building or deploying.

## Overview

The validation pipeline ensures that all Kubernetes manifests are syntactically correct and conform to the Kubernetes API schema before deployment. This catches configuration errors early in the development cycle, preventing deployment failures.

## Quick Reference

### Validate All Manifests
```bash
make k8s-validate
```

This command runs automatically at the start of deployment scripts and prevents deployment if validation fails.

## What Gets Validated

### 1. kind Cluster Configuration
- **File**: `platform/k8s/infra/kind-config.yaml`
- **Validation**: YAML syntax check
- **Requires**: Python (optional but recommended)
- **Checks**:
  - Valid YAML structure
  - File is readable and parseable
  - No syntax errors

If Python is not available, this check is skipped with a warning.

### 2. Helm Charts
The following Helm charts are rendered and validated:

#### Ingress NGINX
- **Chart**: `ingress-nginx/ingress-nginx`
- **Namespace**: `ingress-nginx`
- **Release name**: `ingress-nginx`
- **Values file**: None (uses chart defaults)
- **Validates**: Ingress controller deployment, service, and configuration

#### Metrics Server
- **Chart**: `bitnami/metrics-server`
- **Namespace**: `kube-system`
- **Release name**: `metrics-server`
- **Values file**: `platform/k8s/infra/helm-values/metrics-server-values.yaml`
- **Validates**: Metrics server deployment and API service

#### PostgreSQL
- **Chart**: `bitnami/postgresql`
- **Namespace**: `dev`
- **Release name**: `postgres`
- **Values file**: `platform/k8s/infra/helm-values/postgresql-values.yaml`
- **Validates**: Database StatefulSet, services, and PVC templates

### 3. Kustomize Application Overlay
- **Overlay**: `platform/k8s/apps/overlays/dev`
- **Base**: `platform/k8s/apps/base`
- **Validates**:
  - All application Deployments (agent, client, transaction, log, frontend)
  - All Services
  - Ingress resources
  - ConfigMaps and Secrets
  - Probe patches applied correctly
  - Image tags and names

## Validation Process

### Phase 1: Tool Checks
Verifies that all required tools are installed and accessible:

**Required tools:**
- `helm` — For rendering Helm chart templates
- `kubectl` — For Kustomize rendering
- `kubeconform` — For Kubernetes API schema validation

**Optional tools:**
- `python3` or `python` — For YAML syntax validation of kind config

If any required tool is missing, validation fails with installation hints.

### Phase 2: kind Config Validation
If Python is available, the kind configuration YAML is parsed to ensure:
- File is valid YAML
- No syntax errors
- File is readable

This is a best-effort check. If Python is not available, proceeds with a warning.

### Phase 3: Helm Template Rendering
For each Helm chart:
1. Ensures Helm repositories are added and updated
2. Renders the chart using `helm template` with specified values
3. Saves rendered manifests to temporary directory (`.k8s-validate-tmp/`)
4. Validates each rendered manifest against Kubernetes API schemas

**Helm template command example:**
```bash
helm template <release-name> <chart> \
  --namespace <namespace> \
  --include-crds \
  [-f <values-file>]
```

### Phase 4: kubeconform Validation (Helm outputs)
Each rendered Helm chart is validated using `kubeconform`:

**Validation mode:**
- **Strict**: Validates all required fields and types
- **Ignore missing schemas**: Allows CRDs without published schemas
- **Summary output**: Shows validation statistics

**Example kubeconform command:**
```bash
kubeconform -summary -strict -ignore-missing-schemas <manifest-file>
```

**What it checks:**
- All resource types are valid
- All required fields are present
- Field types match API schema
- No unknown fields (strict mode)
- Enum values are valid
- Resource references are properly formatted

### Phase 5: Kustomize Rendering
Renders the dev overlay using `kubectl kustomize`:

```bash
kubectl kustomize platform/k8s/apps/overlays/dev
```

This process:
1. Reads base manifests from `platform/k8s/apps/base/`
2. Applies patches from `platform/k8s/apps/overlays/dev/`
3. Resolves image tags and names
4. Merges strategic patches (probe configurations, resources, etc.)
5. Outputs complete manifests to temporary file

### Phase 6: kubeconform Validation (Kustomize output)
The complete rendered overlay is validated the same way as Helm outputs:

```bash
kubeconform -summary -strict -ignore-missing-schemas apps-dev.yaml
```

Validates all application resources including:
- Deployments for all services
- Services and endpoints
- Ingress rules
- ConfigMaps and Secrets
- Probe configurations (readiness, liveness, startup)
- Resource requests and limits

### Phase 7: Success Summary
If all validations pass:
- Lists all validated output files
- Shows temporary directory location (`.k8s-validate-tmp/`)
- Exits with code 0

Temporary files are automatically cleaned up on exit (success or failure).

## Installation

### Required Tools

#### Helm
**macOS:**
```bash
brew install helm
```

**Windows (scoop):**
```powershell
scoop install helm
```

**Linux:**
```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

**Verify:**
```bash
helm version
```

#### kubectl
**macOS:**
```bash
brew install kubectl
```

**Windows (scoop):**
```powershell
scoop install kubectl
```

**Linux:**
```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/
```

**Verify:**
```bash
kubectl version --client
```

#### kubeconform
**macOS:**
```bash
brew install kubeconform
```

**Windows (scoop):**
```powershell
scoop install kubeconform
```

**Linux:**
```bash
go install github.com/yannh/kubeconform/cmd/kubeconform@latest
```

**Verify:**
```bash
kubeconform -v
```

### Optional Tools

#### Python
For kind config YAML validation (optional but recommended).

**Windows:**
```powershell
# Via winget
winget install Python.Python.3.12

# Or download from python.org
# https://www.python.org/downloads/
```

**macOS:**
```bash
brew install python3
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install python3

# Fedora/RHEL
sudo dnf install python3
```

**Verify:**
```bash
python3 --version
```

## Understanding Validation Output

### Successful Validation
```
[k8s-validate] Checking required tools...
[k8s-validate] All required tools found.
[k8s-validate] Validating kind config YAML...
[k8s-validate] kind-config.yaml parsed successfully.
[k8s-validate] Ensuring Helm repos are added...
[k8s-validate] Rendering Helm chart: ingress-nginx/ingress-nginx (release=ingress-nginx, namespace=ingress-nginx)...
[k8s-validate] Validating infra-ingress.yaml with kubeconform...
Summary: 15 resources found in 1 file - Valid: 15, Invalid: 0, Errors: 0, Skipped: 0
[k8s-validate] Rendering Helm chart: bitnami/metrics-server (release=metrics-server, namespace=kube-system)...
[k8s-validate] Validating infra-metrics.yaml with kubeconform...
Summary: 8 resources found in 1 file - Valid: 8, Invalid: 0, Errors: 0, Skipped: 0
[k8s-validate] Rendering Helm chart: bitnami/postgresql (release=postgres, namespace=dev)...
[k8s-validate] Validating infra-postgres.yaml with kubeconform...
Summary: 12 resources found in 1 file - Valid: 12, Invalid: 0, Errors: 0, Skipped: 0
[k8s-validate] Rendering Kustomize overlay: .../platform/k8s/apps/overlays/dev...
[k8s-validate] Validating apps-dev.yaml with kubeconform...
Summary: 25 resources found in 1 file - Valid: 25, Invalid: 0, Errors: 0, Skipped: 0

=== K8s Validation Passed ===
Validated outputs:
  - .../k8s-validate-tmp/infra-ingress.yaml
  - .../k8s-validate-tmp/infra-metrics.yaml
  - .../k8s-validate-tmp/infra-postgres.yaml
  - .../k8s-validate-tmp/apps-dev.yaml
Temp dir: .../.k8s-validate-tmp
```

### Failed Validation Examples

#### Missing Required Tool
```
[k8s-validate] Checking required tools...
[k8s-validate] Missing required tool(s): kubeconform

Install hints:
  helm         -> https://helm.sh/docs/intro/install/
  kubectl      -> https://kubernetes.io/docs/tasks/tools/
  kubeconform  -> https://github.com/yannh/kubeconform#installation
```

**Solution:** Install the missing tool using the provided link.

#### Invalid YAML Syntax
```
[k8s-validate] Validating kind config YAML...
Invalid YAML: mapping values are not allowed here
[k8s-validate] ERROR: kind-config.yaml is not valid YAML.
```

**Solution:** Fix YAML syntax errors in `platform/k8s/infra/kind-config.yaml`.

#### Helm Template Failure
```
[k8s-validate] Rendering Helm chart: bitnami/postgresql (release=postgres, namespace=dev)...
[k8s-validate] ERROR: helm template failed for bitnami/postgresql. Output:
Error: template: postgresql/templates/statefulset.yaml:45:28: executing "postgresql/templates/statefulset.yaml" at <.Values.persistence.size>: nil pointer evaluating interface {}.size
```

**Solution:** Check Helm values file for missing or incorrect values. Common issues:
- Missing required values
- Incorrect value types
- Referenced values don't exist

#### kubeconform Schema Validation Failure
```
[k8s-validate] Validating apps-dev.yaml with kubeconform...
stdin - Deployment agent in dev namespace is invalid: Invalid type. Expected: [integer,null], given: string
Summary: 25 resources found in 1 file - Valid: 24, Invalid: 1, Errors: 0, Skipped: 0
[k8s-validate] ERROR: kubeconform validation failed for apps-dev.yaml
```

**Solution:** Fix the field type error. Common issues:
- String used where integer expected (e.g., `replicas: "3"` should be `replicas: 3`)
- Missing required fields
- Unknown fields (typos in field names)
- Enum value not in allowed list

#### Kustomize Build Failure
```
[k8s-validate] Rendering Kustomize overlay: .../platform/k8s/apps/overlays/dev...
[k8s-validate] ERROR: kubectl kustomize failed. Output:
Error: accumulating components: accumulation err='accumulating resources from 'agent-probes-patch.yaml': evalsymlink failure on '.../platform/k8s/apps/overlays/dev/agent-probes-patch.yaml' : lstat .../platform/k8s/apps/overlays/dev/agent-probes-patch.yaml: no such file or directory': must build at directory: '/home/user/repo/platform/k8s/apps/overlays/dev': file 'agent-probes-patch.yaml' doesn't exist
```

**Solution:** Check kustomization.yaml for:
- Referenced files that don't exist
- Incorrect file paths
- Missing patches or resources

## Common Validation Issues

### 1. Image Tag Placeholders Not Replaced
**Symptom:**
```
Warning: Field spec.template.spec.containers[0].image contains placeholder: agent:dev
```

**Explanation:** Kustomize image transformation didn't apply correctly.

**Solution:**
- Verify `images` section in `kustomization.yaml`
- Check that image name matches exactly in both base and overlay
- Ensure `newTag` is specified

### 2. Strategic Merge Patch Conflicts
**Symptom:**
```
Error: conflict: add operation does not apply: doc is missing key: spec.template.spec.containers
```

**Explanation:** Patch targets a path that doesn't exist in base manifest.

**Solution:**
- Verify patch structure matches base manifest
- Check that patch is targeting the correct resource
- Ensure patch operations are valid (add, replace, remove)

### 3. Missing CRD Schemas
**Symptom:**
```
Warning: Set to ignore missing schemas
```

**Explanation:** Custom Resource Definitions don't have published schemas in kubeconform's cache.

**Solution:** This is expected and safe. The `--ignore-missing-schemas` flag allows validation to proceed. CRDs will be validated at runtime by the Kubernetes API server.

### 4. Probe Configuration Errors
**Symptom:**
```
spec.template.spec.containers[0].readinessProbe.httpGet.port: Invalid type. Expected: [integer,string], given: null
```

**Explanation:** Probe port is missing or null.

**Solution:**
- Ensure probe port is specified: either numeric (`80`) or named (`"http"`)
- Verify named ports are defined in `containerPort` section
- Check probe patch is applied correctly

## Integration with Deployment Pipeline

### Automatic Validation
The validation runs automatically as the first step in:

1. **`scripts/build-and-deploy-k8s/build-and-deploy-k8s-local.ps1`**
2. **`scripts/build-and-deploy-k8s/build-and-deploy-k8s-local.sh`**

If validation fails, the deployment is aborted before any cluster operations begin.

### Manual Validation
You can run validation independently at any time:

```bash
# From repository root
make k8s-validate

# Or directly
bash scripts/validate-k8s/validate.sh
```

### CI/CD Integration
Add validation to your CI/CD pipeline:

```yaml
# Example GitHub Actions workflow
steps:
  - name: Validate Kubernetes manifests
    run: make k8s-validate
```

Exit codes:
- **0**: All validations passed
- **1**: One or more validations failed

## Best Practices

### For Developers

1. **Run validation before committing**:
   ```bash
   make k8s-validate
   ```

2. **Keep Helm values files updated** when changing chart versions

3. **Test patches locally** before committing:
   ```bash
   kubectl kustomize platform/k8s/apps/overlays/dev | less
   ```

4. **Use strategic merge patches** instead of replacing entire manifests

5. **Validate after adding new services**:
   - Add base manifests
   - Update kustomization.yaml
   - Run `make k8s-validate`

### For Infrastructure Changes

1. **Update Helm chart versions carefully**:
   - Check chart documentation for breaking changes
   - Update values files accordingly
   - Test with `helm template` before deploying

2. **Keep kubeconform updated** to get latest Kubernetes API schemas:
   ```bash
   # macOS
   brew upgrade kubeconform
   ```

3. **Document custom patches** in comments within patch files

## Troubleshooting

### Validation Passes but Deployment Fails
**Possible causes:**
- **Runtime issues**: Validation checks syntax, not runtime behavior
- **Resource conflicts**: Namespace already has conflicting resources
- **Resource limits**: Cluster doesn't have enough CPU/memory
- **Image availability**: Images don't exist or can't be pulled

**Solution:** Check deployment logs and pod events for runtime errors.

### Helm Repo Update Fails
**Symptom:**
```
Error: failed to fetch https://kubernetes.github.io/ingress-nginx/index.yaml
```

**Solution:**
- Check internet connectivity
- Verify firewall/proxy settings
- Try manually: `helm repo update`

### Python Not Found Warning
**Symptom:**
```
[k8s-validate] WARNING: python not found; skipping YAML parse check for kind-config.yaml.
```

**Impact:** kind config YAML syntax is not validated (minor impact)

**Solution:** Install Python (optional) or proceed without this check.

## Related Documentation

- [Local K8s Development Guide](../../docs/local-k8s-dev.md) - Complete setup and deployment
- [Build and Deploy Scripts](../build-and-deploy-k8s/README.md) - Deployment pipeline
- [ADR-0002](../../docs/architectural-decisions-record/adr-0002-standardize-local-k8s-deploy-workflow.md) - Workflow standards

## See Also

- [kubeconform GitHub](https://github.com/yannh/kubeconform) - Schema validation tool
- [Kustomize Documentation](https://kubectl.docs.kubernetes.io/references/kustomize/) - Kubernetes native configuration
- [Helm Documentation](https://helm.sh/docs/) - Package manager for Kubernetes
- [Makefile](../../Makefile) - Build targets reference
