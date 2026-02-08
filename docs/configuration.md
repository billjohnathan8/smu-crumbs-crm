# Configuration Guide

This guide documents all configuration options for the CS301-ITSA-Scroogebank-CRM system, including environment variables, config files, and how to customize settings for different environments.

---

## 📋 Table of Contents

- [Configuration Philosophy](#configuration-philosophy)
- [Environment Variables](#environment-variables)
- [Configuration Files](#configuration-files)
- [Service Configuration](#service-configuration)
- [Kubernetes Configuration](#kubernetes-configuration)
- [Local vs Production](#local-vs-production)
- [Secrets Management](#secrets-management)

---

## 🎯 Configuration Philosophy

**Principles:**
- **12-Factor App:** Configuration is separated from code and injected via environment variables
- **Environment-specific:** Different configs for local, staging, production
- **Secure by default:** No secrets in code or version control
- **Documented:** All config options are documented here

**Configuration hierarchy:**
```
Default values (in code)
  ↓
Config files (application.yml, .env)
  ↓
Environment variables (highest priority)
```

---

## 🌍 Environment Variables

### Backend Services (Java - Agent, Client, Transaction)

| Variable | Default | Description |
|----------|---------|-------------|
| `SPRING_PROFILES_ACTIVE` | `default` | Spring profile (e.g., `dev`, `prod`) |
| `SERVER_PORT` | `8080` (agent), `8081` (client), `8082` (transaction) | HTTP server port |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://localhost:5432/crm_db` | Database connection URL |
| `SPRING_DATASOURCE_USERNAME` | `postgres` | Database username |
| `SPRING_DATASOURCE_PASSWORD` | `postgres` | Database password |
| `SPRING_JPA_HIBERNATE_DDL_AUTO` | `update` | Hibernate schema management (`update`, `create-drop`, `validate`, `none`) |
| `SPRING_JPA_SHOW_SQL` | `false` | Show SQL statements in logs |
| `LOG_SERVICE_URL` | `http://log-service:8083` | URL of log service for audit events |
| `JAVA_OPTS` | (empty) | JVM options (e.g., `-Xmx512m -Xms256m`) |

**Kubernetes ConfigMap/Environment:**
```yaml
# platform/k8s/apps/base/agent-deployment.yaml
env:
  - name: SPRING_DATASOURCE_URL
    value: jdbc:postgresql://postgres-postgresql.dev.svc.cluster.local:5432/crm_db
  - name: SPRING_DATASOURCE_USERNAME
    valueFrom:
      secretKeyRef:
        name: postgres-secret
        key: username
  - name: SPRING_DATASOURCE_PASSWORD
    valueFrom:
      secretKeyRef:
        name: postgres-secret
        key: password
```

---

### Backend Service (Python - Log)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8083` | HTTP server port |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/crm_db` | PostgreSQL connection string |
| `LOG_LEVEL` | `INFO` | Logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |
| `UVICORN_HOST` | `0.0.0.0` | Uvicorn bind host |
| `UVICORN_PORT` | `8083` | Uvicorn bind port |
| `UVICORN_RELOAD` | `false` | Enable auto-reload (dev only) |

**Kubernetes ConfigMap/Environment:**
```yaml
# platform/k8s/apps/base/log-deployment.yaml
env:
  - name: DATABASE_URL
    value: postgresql://postgres:postgres@postgres-postgresql.dev.svc.cluster.local:5432/crm_db
  - name: LOG_LEVEL
    value: INFO
```

---

### Frontend Service (React - crm-ui)

**Build-time variables** (injected by Vite):

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `/api` | Base URL for backend API calls |
| `VITE_APP_TITLE` | `Scroogebank CRM` | Application title |
| `VITE_ENVIRONMENT` | `development` | Environment name |

**Create `.env` file in `services/frontend/crm-ui/`:**

```bash
# Local development
VITE_API_BASE_URL=/api
VITE_APP_TITLE=Scroogebank CRM (Local)
VITE_ENVIRONMENT=development
```

**Production build:**
```bash
# Production
VITE_API_BASE_URL=https://api.example.com
VITE_APP_TITLE=Scroogebank CRM
VITE_ENVIRONMENT=production
```

**Access in code:**
```typescript
const apiUrl = import.meta.env.VITE_API_BASE_URL;
const appTitle = import.meta.env.VITE_APP_TITLE;
```

---

### Infrastructure Components

#### PostgreSQL (Bitnami Helm Chart)

**Configured via:** `platform/k8s/infra/helm-values/postgres-values.yaml`

```yaml
auth:
  username: postgres
  password: postgres  # ⚠️ Local dev only! Use Secrets in prod
  database: crm_db

primary:
  persistence:
    enabled: false  # Ephemeral storage for local dev

resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

**Override during deployment:**
```bash
helm install postgres bitnami/postgresql \
  -f platform/k8s/infra/helm-values/postgres-values.yaml \
  --set auth.password=MyCustomPassword \
  --namespace dev
```

---

#### ingress-nginx (Helm Chart)

**Configured via:** `platform/k8s/infra/helm-values/ingress-nginx-values.yaml`

```yaml
controller:
  hostPort:
    enabled: true
  service:
    type: NodePort
  nodeSelector:
    ingress-ready: "true"
  tolerations:
    - key: "node-role.kubernetes.io/control-plane"
      operator: "Exists"
      effect: "NoSchedule"
```

---

#### metrics-server (Helm Chart)

**Configured via:** `platform/k8s/infra/helm-values/metrics-server-values.yaml`

```yaml
args:
  - --kubelet-insecure-tls  # Required for kind
  - --kubelet-preferred-address-types=InternalIP
```

---

## 📄 Configuration Files

### Backend Services (Java)

**Location:** `services/backend/<service>/src/main/resources/application.yml`

**Example (Agent Service):**

```yaml
spring:
  application:
    name: agent-service

  datasource:
    url: ${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost:5432/crm_db}
    username: ${SPRING_DATASOURCE_USERNAME:postgres}
    password: ${SPRING_DATASOURCE_PASSWORD:postgres}
    driver-class-name: org.postgresql.Driver

  jpa:
    hibernate:
      ddl-auto: ${SPRING_JPA_HIBERNATE_DDL_AUTO:update}
    show-sql: ${SPRING_JPA_SHOW_SQL:false}
    database-platform: org.hibernate.dialect.PostgreSQLDialect

server:
  port: ${SERVER_PORT:8080}

logging:
  level:
    root: INFO
    com.scroogebank.crm: DEBUG

log-service:
  url: ${LOG_SERVICE_URL:http://localhost:8083}
```

**Profile-specific configs:**

Create `application-dev.yml`, `application-prod.yml`:

```yaml
# application-dev.yml
spring:
  jpa:
    show-sql: true
    hibernate:
      ddl-auto: create-drop

logging:
  level:
    com.scroogebank.crm: DEBUG
```

Activate with: `SPRING_PROFILES_ACTIVE=dev`

---

### Backend Service (Python)

**Location:** `services/backend/log/config.py` (or environment variables)

**Example:**

```python
import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/crm_db"
    )
    port: int = int(os.getenv("PORT", "8083"))
    log_level: str = os.getenv("LOG_LEVEL", "INFO")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = Settings()
```

**Create `.env` file in `services/backend/log/`:**

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/crm_db
PORT=8083
LOG_LEVEL=DEBUG
```

---

### Frontend Service

**Location:** `services/frontend/crm-ui/.env`

```bash
# API endpoint
VITE_API_BASE_URL=/api

# App metadata
VITE_APP_TITLE=Scroogebank CRM
VITE_ENVIRONMENT=development

# Feature flags (optional)
VITE_ENABLE_DEBUG=true
VITE_ENABLE_MOCKING=false
```

**Environment-specific files:**
- `.env` - Default values
- `.env.local` - Local overrides (gitignored)
- `.env.production` - Production values

---

## ⚙️ Service Configuration

### Agent Service

| Config | Default | Description |
|--------|---------|-------------|
| `server.port` | `8080` | HTTP server port |
| `spring.datasource.url` | `jdbc:postgresql://localhost:5432/crm_db` | Database URL |
| `log-service.url` | `http://localhost:8083` | Log service URL for audit events |

**Health endpoint:** `GET /health`

**Readiness probe:**
```yaml
readinessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 5
```

---

### Client Service

| Config | Default | Description |
|--------|---------|-------------|
| `server.port` | `8081` | HTTP server port |
| `spring.datasource.url` | `jdbc:postgresql://localhost:5432/crm_db` | Database URL |
| `log-service.url` | `http://localhost:8083` | Log service URL |

**Health endpoint:** `GET /health`

---

### Transaction Service

| Config | Default | Description |
|--------|---------|-------------|
| `server.port` | `8082` | HTTP server port |
| `spring.datasource.url` | `jdbc:postgresql://localhost:5432/crm_db` | Database URL |
| `log-service.url` | `http://localhost:8083` | Log service URL |

**Health endpoint:** `GET /health`

---

### Log Service

| Config | Default | Description |
|--------|---------|-------------|
| `PORT` | `8083` | HTTP server port |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/crm_db` | Database connection string |
| `LOG_LEVEL` | `INFO` | Application log level |

**Health endpoint:** `GET /health`

---

## ☸️ Kubernetes Configuration

### kind Cluster Configuration

**Location:** `platform/k8s/infra/kind-config.yaml`

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: cs301-crm
nodes:
  - role: control-plane
    kubeadmConfigPatches:
      - |
        kind: InitConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-labels: "ingress-ready=true"
    extraPortMappings:
      - containerPort: 80
        hostPort: 80
        protocol: TCP
      - containerPort: 443
        hostPort: 443
        protocol: TCP
```

**Key settings:**
- `name: cs301-crm` - Cluster name
- `extraPortMappings` - Exposes ports 80/443 for ingress

---

### Kustomize Configuration

**Base manifests:** `platform/k8s/apps/base/`

**Dev overlay:** `platform/k8s/apps/overlays/dev/kustomization.yaml`

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: dev

resources:
  - ../../base

images:
  - name: agent
    newTag: dev
  - name: client
    newTag: dev
  - name: transaction
    newTag: dev
  - name: log
    newTag: dev
  - name: crm-ui
    newTag: dev

patches:
  - path: agent-probes-patch.yaml
  - path: client-probes-patch.yaml
  - path: transaction-probes-patch.yaml
  - path: log-probes-patch.yaml
  - path: frontend-probes-patch.yaml
```

**To create a new environment (e.g., staging):**

```bash
mkdir -p platform/k8s/apps/overlays/staging
cd platform/k8s/apps/overlays/staging

# Create kustomization.yaml
cat > kustomization.yaml <<EOF
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: staging

resources:
  - ../../base

images:
  - name: agent
    newTag: staging
  # ... other images

# Custom ConfigMaps, Secrets, resource limits, etc.
EOF
```

**Deploy staging:**
```bash
kubectl apply -k platform/k8s/apps/overlays/staging
```

---

## 🔄 Local vs Production

### Local Development (kind)

| Component | Configuration |
|-----------|--------------|
| **Database** | Shared PostgreSQL in `dev` namespace |
| **Secrets** | Hardcoded (`postgres`/`postgres`) in Helm values |
| **Persistence** | Disabled (ephemeral storage) |
| **Ingress** | `localhost` via NodePort |
| **Resource Limits** | Minimal (256Mi memory, 250m CPU) |
| **Auto-scaling** | Disabled |
| **Probes** | Relaxed timings (faster startup) |

**Example local config:**
```yaml
# platform/k8s/infra/helm-values/postgres-values.yaml
auth:
  password: postgres  # ⚠️ Not secure! Local only

primary:
  persistence:
    enabled: false  # No persistent storage
```

---

### Production (AWS EKS - Planned)

| Component | Configuration |
|-----------|--------------|
| **Database** | AWS RDS PostgreSQL (isolated per service) |
| **Secrets** | AWS Secrets Manager |
| **Persistence** | EBS volumes with backup |
| **Ingress** | AWS ALB with TLS/SSL |
| **Resource Limits** | Production-grade (2Gi memory, 1000m CPU) |
| **Auto-scaling** | HPA + Cluster Autoscaler |
| **Probes** | Strict timings (production reliability) |

**Example production config:**
```yaml
# production/postgres-values.yaml (conceptual)
auth:
  existingSecret: postgres-credentials  # From AWS Secrets Manager

primary:
  persistence:
    enabled: true
    storageClass: gp3
    size: 50Gi

backup:
  enabled: true
  cronjob:
    schedule: "0 2 * * *"  # Daily at 2 AM

resources:
  limits:
    memory: "2Gi"
    cpu: "1000m"
  requests:
    memory: "1Gi"
    cpu: "500m"
```

---

## 🔐 Secrets Management

### Local Development

**Current approach:** Secrets are hardcoded in config files (acceptable for local dev only)

**Where secrets are defined:**
- Helm values: `platform/k8s/infra/helm-values/*.yaml`
- Application configs: `services/backend/*/src/main/resources/application.yml`

**⚠️ Warning:** These secrets are **for local development only** and must **never be used in production**.

---

### Production (Planned)

**AWS Secrets Manager integration:**

```yaml
# Use External Secrets Operator or similar
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: postgres-credentials
  namespace: prod
spec:
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: postgres-secret
  data:
    - secretKey: username
      remoteRef:
        key: prod/postgres
        property: username
    - secretKey: password
      remoteRef:
        key: prod/postgres
        property: password
```

**Service configuration:**
```yaml
env:
  - name: SPRING_DATASOURCE_PASSWORD
    valueFrom:
      secretKeyRef:
        name: postgres-secret
        key: password
```

---

## 🛠️ Customization Examples

### Example 1: Change Database Name

**Local (Helm):**
```bash
helm install postgres bitnami/postgresql \
  -f platform/k8s/infra/helm-values/postgres-values.yaml \
  --set auth.database=my_custom_db \
  --namespace dev
```

**Update service configs:**
```yaml
# In deployment YAML
env:
  - name: SPRING_DATASOURCE_URL
    value: jdbc:postgresql://postgres-postgresql.dev.svc.cluster.local:5432/my_custom_db
```

---

### Example 2: Increase Resource Limits

**Edit deployment:**
```yaml
# platform/k8s/apps/overlays/dev/agent-resources-patch.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent
spec:
  template:
    spec:
      containers:
        - name: agent
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
```

**Add to kustomization.yaml:**
```yaml
patches:
  - path: agent-resources-patch.yaml
```

**Apply:**
```bash
kubectl apply -k platform/k8s/apps/overlays/dev
```

---

### Example 3: Enable Debug Logging

**Via environment variable:**
```yaml
env:
  - name: SPRING_JPA_SHOW_SQL
    value: "true"
  - name: LOGGING_LEVEL_COM_ITSA_CRM
    value: DEBUG
```

**Via ConfigMap:**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: agent-config
  namespace: dev
data:
  application.yml: |
    logging:
      level:
        root: INFO
        com.scroogebank.crm: DEBUG
    spring:
      jpa:
        show-sql: true
```

**Mount ConfigMap:**
```yaml
volumeMounts:
  - name: config
    mountPath: /app/config
volumes:
  - name: config
    configMap:
      name: agent-config
```

---

## 📚 Related Documentation

- **[Architecture](architecture.md)** - System architecture overview
- **[Local K8s Development](local-k8s-dev.md)** - Local deployment guide
- **[Troubleshooting](troubleshooting.md)** - Common configuration issues
- **[Service READMEs](../services/)** - Per-service configuration details

---

**Last Updated:** February 2026

**Back to:** [Documentation Hub](README.md) | [Main README](../README.md)
