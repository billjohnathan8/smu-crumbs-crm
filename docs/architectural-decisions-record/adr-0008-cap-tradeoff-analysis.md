# ADR 0008: CAP Theorem Tradeoffs and Consistency-First Architecture

- **Date:** 2026-03-29
- **Status:** Accepted
- **Deciders:** Development Team
- **Related:** [adr-0003-route-audit-events-to-http-log-service.md](adr-0003-route-audit-events-to-http-log-service.md)

## Context

The Scrooge Bank CRM system is a distributed application with multiple data stores (PostgreSQL, DynamoDB), messaging systems (SQS, SNS), and microservices. Understanding how the system handles consistency, availability, and partition tolerance (CAP theorem) is critical for:

1. Setting accurate expectations for system behavior during failures
2. Making informed decisions about data replication and failover
3. Avoiding misleading claims about high availability posture
4. Distinguishing between single-node test environments and distributed production behavior

### CS301 Requirements
- 100 concurrent agents support
- Transactional correctness for banking operations
- Audit trail compliance

### System Constraints
- PostgreSQL as primary data store
- Optional AWS RDS Multi-AZ failover
- LocalStack/single-node for local development and CI
- Budget-conscious infrastructure (non-prod profiles use single-AZ)

## Decision

**We adopt a consistency-first architecture with availability-tolerant side effects:**

1. **Core Business Data (Consistency-First):**
   - User, client, and transaction data uses PostgreSQL with ACID transactions
   - Single-writer database contract (not multi-writer or replica-based)
   - Flyway migrations, `@Transactional` annotations, database constraints
   - Multi-AZ failover available but environment-dependent (enabled in prod, disabled in dev/integration/lab)

2. **Side Effects (Availability-Tolerant):**
   - Audit logging failures do not block primary operations (catch-and-warn pattern)
   - Email/verification notifications are best-effort with async retry
   - Optional SQS→Lambda→DynamoDB pipelines for eventual consistency
   - Feature-gated async pipelines (disabled by default)

3. **Partition Tolerance:**
   - Relevant at distributed boundaries: service-to-service HTTP, SQS/SNS messaging, S3 ingestion
   - NOT relevant for local/CI single-node PostgreSQL runs
   - In-memory stores are explicitly single-replica only (stateful scale-out disabled)

## Alternatives Considered

### 1. AP-Centric (Availability-First) Architecture
**Description:** Use eventually consistent data stores, multi-master replication, conflict resolution for core banking data.

**Why Not:**
- Banking operations require transactional correctness (ACID)
- Conflict resolution for account balances/transactions is high-risk
- Team lacks expertise in distributed consensus protocols
- CS301 timeline insufficient for robust eventual consistency implementation

### 2. Distributed Read Replicas for Scalability
**Description:** PostgreSQL read replicas with read/write split, Aurora multi-AZ cluster.

**Why Not:**
- Current load profile (100 concurrent agents) does not require read scaling
- Adds operational complexity (replica lag monitoring, connection routing)
- Budget constraints for multi-AZ Aurora in non-prod environments
- No evidence of read-heavy workload requiring horizontal read scaling

### 3. Strong Consistency for All Side Effects
**Description:** Make audit logging and notifications blocking/transactional with primary operations.

**Why Not:**
- Reduces availability of primary transaction path
- Audit service outage would block customer operations
- ADR-0003 explicitly chose best-effort audit logging
- Regulatory audit requirements met through retry and DLQ mechanisms

## Consequences

### Positive

- **Clear correctness guarantees:** ACID transactions protect core banking data integrity
- **Predictable behavior:** Developers understand transactional boundaries
- **Simplified reasoning:** Consistency-first model easier to test and reason about
- **Appropriate for domain:** Banking operations naturally require consistency over availability
- **Honest HA claims:** Documentation aligns with actual implementation (single-writer DB)
- **Availability where it matters:** Side-effect failures don't block customer operations

### Negative / Risks

- **Single point of failure:** Single-writer PostgreSQL is a bottleneck during DB outages
- **Failover downtime:** Multi-AZ RDS failover takes 1-3 minutes (not zero downtime)
- **Environment inconsistency:** Non-prod uses single-AZ (different failure modes than prod)
- **Read scalability limits:** No read replicas means read-heavy workloads hit primary
- **CAP misunderstandings:** Team/stakeholders may misinterpret "Multi-AZ" as high availability
- **Async pipeline complexity:** Feature-gated pipelines add operational burden when enabled

### Mitigations

1. **RDS Automated Backups:** 7-day retention, point-in-time recovery (RPO ~5 minutes)
2. **Multi-AZ in Prod:** Enabled for production-like environments (failover tested)
3. **Connection Pool Tuning:** HikariCP configured for burst load (50-100 connections)
4. **DLQ for Async Pipelines:** Failed audit/AML events preserved for replay
5. **Clear Documentation:** Distinguish "consistency-first with optional failover" from "highly available replicated platform"
6. **Smoke Tests:** Validate failover behavior in integration environment before prod
7. **Graceful Degradation:** Audit/notification failures logged but don't block operations

## Implementation Notes

### Database Posture
- **Single-writer contract:** One `aws_db_instance.postgres` with single JDBC endpoint
- **No read replicas:** No `aws_db_instance_read_replica` or Aurora cluster resources
- **Multi-AZ toggle:** Controlled via `db_multi_az` variable (prod: true, non-prod: false)
- **Backups:** Automated backup plan active, 7-day retention

### Code Patterns
- **Transactional annotations:** `@Transactional` on service methods that mutate state
- **Catch-and-warn for side effects:** `try { auditLog(...) } catch (e) { log.warn(...) }`
- **Idempotent consumers:** Lambda handlers use conditional DynamoDB puts
- **Import polling:** Transaction ingestion uses `status` field polling (not synchronous)

### Terraform Configuration
- **Prod:** `db_multi_az=true`, `enforce_strict_prod_guardrails=false` (budget-first)
- **Integration:** `db_multi_az=false`, async pipelines disabled
- **Lab:** `db_multi_az=false`, async pipelines "partial scaffold only"
- **Local:** Single Postgres container, no failover

### Testing Strategy
- **Local/CI:** Single-node Postgres (CAP not applicable)
- **Integration:** Test failover behavior before prod deployment
- **Smoke tests:** Validate audit failures don't block operations

### Presentation-Safe Claims
✅ **DO SAY:**
- "Consistency-first architecture with ACID transactions for core banking data"
- "Multi-AZ failover available in production (1-3 minute RTO)"
- "Audit logging and notifications are best-effort to maintain primary operation availability"
- "Async pipelines exist for eventual consistency but are feature-gated by default"

❌ **DON'T SAY:**
- "We have full DB replication/read-scaling"
- "CAP tradeoff is uniformly AP across the system"
- "Highly available replicated database platform"
- "Zero-downtime failover"

### Evidence Sources
- `platform/terraform/modules/rds/main.tf` - Single DB instance contract
- `platform/terraform/env/*.tfvars` - Multi-AZ and pipeline toggles
- `services/backend/client/src/main/java/.../ClientServiceImpl.java` - Catch-and-warn audit pattern
- `services/backend/audit-consumer/lambda_function.py` - Idempotent DynamoDB writes
- `docs/architectural-decisions-record/adr-0003-route-audit-events-to-http-log-service.md` - Best-effort logging decision

## Residual Ambiguities

1. **Environment-specific behavior:** Which tfvars profiles are deployed where (dev/staging/prod)
2. **Operational failover:** RTO/RPO validation through failover drills not evidenced
3. **Async pipeline activation:** Whether audit/AML pipelines enabled in any non-default deployment
4. **Production guardrails:** Whether prod runtime uses stricter overrides than committed tfvars
5. **Scope boundaries:** "Production-like" vs "actual production" configuration drift

## Related Work

- **ADR-0003:** Chose HTTP log service over embedded logging (availability-tolerant side effect)
- **Backup/Restore:** `platform/terraform/modules/backup/main.tf` - 7-day retention
- **Connection Pool:** `docs/performance/DATABASE-POOL-TUNING.md` - HikariCP configuration
- **Audit Contracts:** `docs/api-contracts/audit-aml-consumer-event-contracts.md` - Async pipeline schemas

## Revision History

- **2026-03-29:** Initial ADR created from CAP tradeoff audit analysis
