# ADR 0006: Use KIND over Minikube for Local Kubernetes Development

- **Date:** 2026-02-08
- **Status:** Accepted
- **Deciders:** Team
- **Related:** [ADR-0001: Adopt kind + Kustomize](adr-0001-adopt-kind-kustomize-local-k8s-topology.md), `scripts/platform/kind-up.sh`, `platform/k8s/infra/kind-config.yaml`

## Context
The project requires a local Kubernetes environment for developing and testing a polyglot microservices architecture consisting of 5+ backend services (Java + Python), a React frontend, and infrastructure components (PostgreSQL, NGINX ingress). 

Team members need to frequently:
- Build and deploy the full stack locally
- Test changes across multiple services
- Run smoke tests and CI/CD validation
- Iterate quickly during development

Performance benchmarks from recent deployment logs show:
- Cluster startup: ~39s
- Infrastructure deployment (Helm charts): ~100s
- Image build + load: ~106s combined
- Application deployment: ~25s
- **Total cycle: ~5 minutes** for full build-deploy-test

The question arose whether **Minikube** would provide faster iteration cycles compared to our current **KIND** setup.

### Constraints
- Windows development environment with PowerShell/Git Bash
- Multi-service architecture requiring frequent image updates
- Need for easy cluster reset and reproduction
- Port mapping required for localhost ingress access (ports 80, 443)
- Team familiarity with Docker-based workflows

## Decision
**Continue using KIND (Kubernetes in Docker)** as the local Kubernetes runtime instead of switching to Minikube.

KIND runs Kubernetes clusters as Docker containers rather than inside a VM, providing:
- Faster image loading via direct Docker registry access
- No VM overhead for multi-container workloads
- Native integration with local Docker daemon
- Simple cluster lifecycle management (create/delete in ~40s)

## Alternatives Considered

### Minikube
**Pros:**
- More mature ecosystem with extensive driver support
- Better persistent volume handling via VM filesystem
- Built-in addons (dashboard, metrics-server, ingress)
- Slightly better documentation for CNI plugin testing

**Cons (Why Rejected):**
- **VM overhead adds 20-40% to startup and image loading times**
- Image loading requires either:
  - Rebuilding inside the VM (duplicates build time)
  - Using `minikube image load` with VM transfer overhead (~30-50% slower than KIND's direct load)
- Heavier resource footprint for multi-service development
- Additional complexity managing VM drivers on Windows
- Our logs show KIND already achieves ~5min full cycle - Minikube would increase this to ~6-7min

### k3d (k3s in Docker)
**Pros:**
- Similar Docker-based approach to KIND
- Lighter weight Kubernetes distribution
- Fast startup times

**Cons:**
- k3s API differences could cause compatibility issues
- Less Kubernetes API feature parity than KIND
- Smaller community compared to KIND/Minikube

### Docker Desktop Kubernetes
**Cons:**
- Single-node only
- Less control over cluster configuration
- Harder to reset and reproduce
- PORT mapping limitations

## Consequences

### Positive
- **Fast image loading**: KIND's direct Docker registry access loads images in ~64s for our full stack
- **No VM overhead**: Container-based nodes reduce startup time and resource usage
- **Easy cluster reset**: `make kind-up` creates reproducible clusters in ~39s
- **Port mapping simplicity**: Host ports 80/443 map directly to ingress without VM networking layers
- **Team workflow alignment**: Developers already use Docker; KIND leverages existing knowledge
- **CI/CD compatibility**: KIND works seamlessly in GitHub Actions (already implemented in our CI)

### Negative / Risks
- **Persistent volume limitations**: Docker-based volumes don't survive cluster deletion as cleanly as VM-based storage
- **CNI plugin testing**: Some advanced networking scenarios are harder to test vs Minikube's VM isolation
- **Resource constraints**: Large multi-service deployments can strain Docker daemon
- **Windows-specific quirks**: KIND networking can have edge cases on Windows Docker Desktop

### Mitigations
- **Keep cluster running during development**: Avoid teardown between deploys to preserve PVs and reduce restart overhead
- **Implement selective rebuilds**: Use image caching strategies to avoid rebuilding unchanged services
- **Monitor Docker resources**: Set appropriate memory/CPU limits in Docker Desktop settings (minimum 8GB RAM, 4 CPUs recommended)
- **Document cluster reset procedure**: Maintain clear instructions for when full reset is needed vs incremental updates
- **Use direct image loading**: For single-service updates, use `kind load docker-image <service>:dev` instead of full `make kind-load`

## Implementation Notes

### Optimization Opportunities
1. **Incremental deployments** - Skip `kind delete cluster` during active development:
   ```bash
   # Instead of full teardown, just redeploy changed services
   kubectl rollout restart deployment/<service-name> -n crm-apps
   ```

2. **Selective image loading** - Load only changed images:
   ```bash
   kind load docker-image agent-service:dev --name cs301-crm
   ```

3. **Image build caching** - Ensure Docker build cache is leveraged:
   ```bash
   docker build --cache-from agent-service:dev -t agent-service:dev .
   ```

### Current Workflow (Keep)
- Cluster name: `cs301-crm`
- Config: `platform/k8s/infra/kind-config.yaml`
- Initialization script: `scripts/platform/kind-up.sh` (with 3-attempt retry logic)
- Port mappings: 80, 443 for ingress access
- Integration: Makefile targets (`kind-up`, `kind-load`, `kind-down`)

### Monitoring
- Track deployment times in `build-logs/build-and-deploy-k8s/` to identify slowdowns
- Review cluster resource usage: `kubectl top nodes` and `kubectl top pods -A`
- Keep ADR updated if performance characteristics change significantly
