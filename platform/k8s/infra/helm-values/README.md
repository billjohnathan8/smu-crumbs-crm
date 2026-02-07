# Helm Values Configuration

This directory contains Helm chart value overrides for infrastructure components deployed to the local Kubernetes cluster.

## PostgreSQL Configuration

### Overview
The `postgresql-values.yaml` file configures the Bitnami PostgreSQL Helm chart for local development use.

### Key Configuration Decisions

#### 1. **Pinned Image Tags**
```yaml
image:
  tag: "17.2.0-debian-12-r10"  # Specific version, not 'latest'
volumePermissions:
  image:
    tag: "12-debian-12-r38"
```

**Why**: Rolling tags like `:latest` can change unexpectedly, causing:
- Non-reproducible builds
- Unexpected breaking changes
- Difficult debugging when images change between deployments

**Production Note**: Use even more specific tags or digest-based references (e.g., `@sha256:...`)

#### 2. **Explicit Password**
```yaml
auth:
  password: cs301_local_dev_pw
```

**Why**: 
- Prevents random password generation
- Avoids PVC password mismatch issues during cluster recreation
- Makes local dev predictable and easier to debug

**Production Note**: NEVER use plaintext passwords in production. Use `auth.existingSecret` to reference a Kubernetes Secret instead.

#### 3. **Resource Limits**
```yaml
primary:
  resources:
    limits:
      cpu: 500m
      memory: 512Mi
    requests:
      cpu: 100m
      memory: 256Mi
```

**Why**: 
- Prevents PostgreSQL from consuming all cluster resources
- Ensures Kubernetes scheduler can make informed placement decisions
- Required for proper cluster stability and multi-tenant environments

**For Local Dev**: These limits are conservative and should work on most development machines. Adjust based on your workload.

#### 4. **Disabled Persistence**
```yaml
primary:
  persistence:
    enabled: false
```

**Why** (for local dev):
- Faster cluster teardown/recreation
- No disk space accumulation
- Simpler cleanup

**Production Note**: Enable persistence in production with appropriate storage classes and backup strategies.

### Resolving Helm Warnings

The updated configuration addresses these Bitnami PostgreSQL warnings:

| Warning | Root Cause | How Fixed |
|---------|-----------|-----------|
| "Original containers substituted" | Missing explicit image config | Added `image.tag` specification |
| "Rolling tag detected" | Using `:latest` tags | Pinned to specific versions |
| "Resources not set" | Missing `resources` section | Added CPU/memory limits and requests |
| "Password will be ignored" | Random password generation | Set explicit password for local dev |

### Updating Image Versions

To update PostgreSQL to a newer version:

1. Check available tags: https://hub.docker.com/r/bitnami/postgresql/tags
2. Update `image.tag` in `postgresql-values.yaml`
3. Check os-shell compatibility: https://hub.docker.com/r/bitnami/os-shell/tags
4. Update `volumePermissions.image.tag` if needed
5. Test deployment: `make build-and-deploy-local`

### Environment-Specific Configurations

For production or staging environments, create separate value files:
- `postgresql-values-prod.yaml` - Production settings with persistence, high availability
- `postgresql-values-staging.yaml` - Staging environment settings

Key production changes:
```yaml
auth:
  existingSecret: "postgres-credentials"  # Don't use plaintext passwords
primary:
  persistence:
    enabled: true
    size: 100Gi
    storageClass: "gp3"  # AWS EBS example
  resources:
    limits:
      cpu: 2000m
      memory: 4Gi
    requests:
      cpu: 1000m
      memory: 2Gi
architecture: replication  # Enable high availability
replication:
  enabled: true
```

## Metrics Server Configuration

See `metrics-server-values.yaml` for metrics server configuration details.

## References

- [Bitnami PostgreSQL Helm Chart](https://github.com/bitnami/charts/tree/main/bitnami/postgresql)
- [Kubernetes Resource Management](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [Helm Values Documentation](https://helm.sh/docs/chart_template_guide/values_files/)
