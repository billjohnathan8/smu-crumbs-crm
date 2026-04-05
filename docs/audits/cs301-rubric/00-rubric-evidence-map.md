# CS301 Rubric Evidence Map (Audit Only)

Audit date: 2026-04-05  
Repository: `cs301-itsa/project-2025-26-t2-project-2025-26t2-g2-t3`  
Branch audited: `main`

## Audit stance
- Strict and evidence-driven.
- Prefer `Unclear / Evidence Missing` when code/infra/tests/demo evidence is not directly verifiable from the repository.
- Claims below separate: code exists, infra exists, tests exist, demo/report evidence exists.

---

## 1) Repository Inventory (By Subsystem)

### Application services
- Frontend CRM UI (React/TypeScript): `services/frontend/crm-ui/src`
  - Routing/role partitioning: `src/app/App.tsx` (`App`, `ProtectedRoute` usage)
  - Feature API clients: `src/api/users.ts`, `src/api/clients.ts`, `src/api/transactions.ts`, `src/api/logs.ts`, `src/api/communications.ts`, `src/api/aml.ts`
- Backend Java microservices (Spring Boot)
  - User service: `services/backend/user/src/main/java/...`
    - Controllers/services/security: `UserController`, `AuthController`, `UserAccountService`, `JwtService`, `RequestAuth`
  - Client service: `services/backend/client/src/main/java/...`
    - Controllers/services/security: `ClientController`, `AccountController`, `ClientServiceImpl`, `RequestAuth`, `EncryptedStringConverter`, `PiiMasker`
  - Transaction service: `services/backend/transaction/src/main/java/...`
    - Controllers/services/imports: `TransactionsController`, `TransactionsService`, `TransactionImportScheduler`, `S3BackedTransactionFileSource`, `ClientAccessValidator`
- Backend Python Lambdas
  - Log service: `services/backend/log/app` (`lambda_router.py`, `service.py`, `repository.py`, `auth.py`, `client_scope.py`)
  - AML batch engine: `services/backend/aml/lambda_function.py`
  - SFTP transaction collector: `services/backend/sftp-transaction-collector/lambda_function.py`
  - Verification mail/feedback: `services/backend/verification/lambda_function.py`
  - Queue consumers: `services/backend/audit-consumer/lambda_function.py`, `services/backend/aml-consumer/lambda_function.py`

### Infrastructure and platform
- Terraform root and modules: `platform/terraform/main.tf`, `platform/terraform/modules/*`
  - Notable modules used: `ecs`, `lambda`, `rds`, `dynamodb`, `s3`, `sqs`, `sns`, `security`, `observability`, `backup`, `waf`, `network`, `cloudfront`, `alb`, `apigateway`, `sftp-server`
- Local/dev infra and orchestration: `docker-compose.localstack.yml`, `scripts/dev/*`, `scripts/pipelines/*`
- API contracts: `docs/api-contracts/openapi/{user,client,transaction,log,aml}.yaml`, `docs/api-contracts/sftp-transaction-ingestion-contract.md`

### CI/CD and governance
- CI workflows: `.github/workflows/ci-main.yml`, `ci-integration.yml`, `ci-frontend.yml`, service-specific CI workflows, reusable workflows
- CD workflows: `.github/workflows/cd-main.yml` and related deploy workflows
- Branch policy enforcement workflow: `.github/workflows/branch-policy.yml`

### Tests and test harnesses
- Integration (Playwright, live fullstack): `tests/integration/*.spec.ts`
- Performance (JMeter + scripts): `tests/performance/agent-crud-workflow.jmx`, `tests/performance/load_test_python.py`, `scripts/performance/*.sh`
- Unit tests (repo-level wrappers): `tests/unit/*.py`
- Service-level tests:
  - Java: `services/backend/{user,client,transaction}/src/test/java/...`
  - Python Lambda tests: `services/backend/*/tests/*.py`
  - Frontend unit/component: `services/frontend/crm-ui/src/**/__tests__/*`

### Evidence/report artifacts found
- Test-all summaries: `build-logs/test-all/last-run-summary.md`, `build-logs/test-all/last-run-summary.json`
- Build/deploy logs and packages: `build-logs/fullstack-integration/*`, `build-logs/performance/*`, `build-logs/*-package/*`
- Rubric/spec PDFs present: `docs/specifications-docs/cs301-project-report-rubric.pdf`, `docs/specifications-docs/1 - CS301-Project-v17.0.pdf`

---

## 2) Rubric-to-Code Evidence Matrix

Status values: `Implemented`, `Partially Implemented`, `Unclear / Evidence Missing`, `Not Implemented`

| Criterion | Status | Code Exists | Infra Exists | Tests Exist | Demo/Report Evidence Exists | Key Evidence (paths + symbols/resources) |
|---|---|---|---|---|---|---|
| 1. CRM User Management | Implemented | Yes | Yes | Yes | Partial | Code: `services/backend/user/.../controller/UserController.java` (`createUser`, `listUsers`, `disableUser`, `deleteUser`, `resetPassword`), `.../service/UserAccountService.java`; Frontend: `services/frontend/crm-ui/src/pages/AdminUserManagementPage.tsx`, `src/api/users.ts`; Infra: `platform/terraform/main.tf` (ECS services + Cognito wiring + secrets); Tests: `tests/integration/user-management-advanced.spec.ts`, `services/backend/user/src/test/java/.../UserControllerTest.java` |
| 2. Client Profile Management | Implemented | Yes | Yes | Yes | Partial | Code: `services/backend/client/.../controller/ClientController.java` (`createClient`, `getClient`, `updateClient`, `deleteClient`, verification endpoints), `.../service/ClientServiceImpl.java`; Frontend: `services/frontend/crm-ui/src/pages/CreateClientPage.tsx`, `ClientDetailPage.tsx`, `EditClientPage.tsx`, `src/api/clients.ts`; Tests: `tests/integration/client-profile-management.spec.ts`, `services/backend/client/src/test/java/.../ClientControllerTest.java`, `ClientsServiceIT.java` |
| 3. Logging of Agent Interactions and Client Communications | Implemented | Yes | Yes | Yes | Partial | Code: log APIs in `services/backend/log/app/lambda_router.py` (`_create_log`, `_list_logs`, `_create_communication`, `_list_communications`, `_update_communication_status`), persistence in `.../repository.py` (`insert_audit_log`, `insert_communication`); client/user/transaction audit emitters (`HttpClientAuditLogger`, `HttpUserAuditLogger`, `HttpTransactionAuditLogger`); Frontend pages/APIs: `src/pages/ActivityLogsPage.tsx`, `src/pages/AdminCommunications.tsx`, `src/api/logs.ts`, `src/api/communications.ts`; Tests: `tests/integration/audit-logging.spec.ts`, `tests/integration/communication-tracking.spec.ts` |
| 4. Bank Account Transactions + external/mock SFTP ingestion | Implemented | Yes | Yes | Yes | Partial | Code: transaction CRUD/import in `services/backend/transaction/.../controller/TransactionsController.java` (`importTransactions`, `/api/transactions/imports/{id}`), ingestion source in `.../service/imports/S3BackedTransactionFileSource.java`, scheduler in `TransactionImportScheduler.java`; collector Lambda in `services/backend/sftp-transaction-collector/lambda_function.py` (`_latest_csv_key`, `_trigger_import`, `lambda_handler`); Infra: `platform/terraform/main.tf` (`module "sftp_server"`, Lambda wiring, S3 ingestion bucket); Contract/docs: `docs/api-contracts/sftp-transaction-ingestion-contract.md`; Tests: `tests/integration/transaction-management.spec.ts`, `services/backend/sftp-transaction-collector/tests/test_lambda_function.py` |
| Mandatory X-factor beyond 1-4 (AML detection/review workflow) | Implemented | Yes | Yes | Yes | Partial | Code: AML engine `services/backend/aml/lambda_function.py` (Modules A/B/C behavior + `lambda_handler`), AML alert APIs `services/backend/log/app/lambda_router.py` (`_create_aml_alert`, `_list_aml_alerts`, `_review_aml_alert`, `_trigger_aml_scan`), UI `services/frontend/crm-ui/src/pages/AmlAlertsPage.tsx`; Infra: Terraform enables AML lambda + schedule in `platform/terraform/main.tf` (`module "lambda"` AML fields); Tests: `services/backend/aml/tests/*`, `tests/integration/real-fullstack.spec.ts` (create/review AML alert) |
| Scalability / Performance | Partially Implemented | Yes | Yes | Yes | Partial | Code/infra: ECS autoscaling in `platform/terraform/modules/ecs/auto_scaling.tf`, task capacity controls in `platform/terraform/main.tf` (`ecs_min_capacity`, `ecs_max_capacity`, HA floor vars); Tests: JMeter artifacts `tests/performance/agent-crud-workflow.jmx`, scripts `scripts/performance/*.sh`; Evidence gap: CI performance workflow disabled `.github/workflows/ci-performance.yml.disabled`, frontend latency job commented in `.github/workflows/ci-frontend.yml`; mixed latest local result (`build-logs/test-all/last-run-summary.md` shows failed run due frontend lint) |
| Availability | Partially Implemented | Yes | Yes | Limited | Partial | Infra: ECS HA/autoscaling (`platform/terraform/modules/ecs/auto_scaling.tf`), ALB health alarms and service healthy host alarms (`platform/terraform/modules/observability/main.tf`), rollback/deploy flows (`.github/workflows/cd-main.yml`, `cd-rollback-all.yml` exists in workflow list); Evidence gap: no explicit repo evidence of executed failover/chaos drills |
| Maintainability / Extensibility | Partially Implemented | Yes | Yes | Yes | Partial | Modularity: clear service boundaries (`services/backend/{user,client,transaction,log,aml,...}`), IaC modules (`platform/terraform/modules/*`), reusable workflows (`.github/workflows/reusable-*.yml`); contract-driven APIs (`docs/api-contracts/openapi/*.yaml`); Tests broad but uneven CI enforcement for performance. No direct quality trend/technical debt report in-repo |
| Security | Partially Implemented | Yes | Yes | Yes | Partial | Code: JWT auth (`services/backend/user/.../security/JwtService.java`, `services/backend/client/.../security/RequestAuth.java`, `services/backend/log/app/auth.py`), role checks in log router and controllers, PII masking (`client_service/logging/PiiMasker.java`), fail-closed encryption converter + startup key validation (`client_service/crypto/EncryptedStringConverter.java`, `client_service/crypto/PiiEncryptionStartupValidator.java`); Infra: SG/IAM/Secrets in `platform/terraform/modules/security/main.tf`, GuardDuty in `.../security/guardduty.tf`, WAF module wired in `platform/terraform/main.tf`; Tests: `tests/integration/security-adversarial.spec.ts`; P0-1 proof artifact: `docs/audits/artifacts/P0-1-pii-encryption-fail-closed-evidence.md` |
| Observability | Implemented | Yes | Yes | Yes | Partial | Code: structured request IDs and log APIs (`services/backend/log/app/lambda_router.py`, Java `RequestIdFilter` tests), communication status updates (`verification/lambda_function.py` -> log API); Infra: CloudTrail + CloudWatch alarms + SNS in `platform/terraform/modules/observability/main.tf`, VPC flow logs in network module usage (`platform/terraform/main.tf` with `enable_vpc_flow_logs`); Tests include logging behavior checks (`tests/integration/audit-logging.spec.ts`) |
| Durability | Partially Implemented | Yes | Yes | Limited | Partial | Infra: RDS encryption key rotation (`platform/terraform/modules/rds/kms.tf`), AWS Backup plans (`platform/terraform/modules/backup/main.tf`), DynamoDB PITR + TTL (`platform/terraform/modules/dynamodb/main.tf`); Evidence gap: no restore test runbooks/results found in repo artifacts |
| Agility / CI-CD | Partially Implemented | Yes | Yes | Yes | Partial | CI matrix + reusable workflows: `.github/workflows/ci-main.yml`, `ci-integration.yml`, `reusable-test-component*.yml`; CD selective deploy: `.github/workflows/cd-main.yml`; branch strategy enforcement: `.github/workflows/branch-policy.yml`; Gap: some required quality/perf checks intentionally disabled/commented in CI frontend and perf workflow |
| Architecture quality | Implemented | Yes | Yes | Yes | Partial | Microservice + event-driven + IaC architecture is explicit in structure and Terraform composition: `platform/terraform/main.tf`, services split under `services/backend/*`, frontend `services/frontend/crm-ui`; API contracts in `docs/api-contracts/openapi/*.yaml`; integration tests span cross-service flows (`tests/integration/real-fullstack.spec.ts`) |
| Data segregation | Implemented | Yes | Yes | Yes | Partial | Code enforcement: ownership checks `ClientServiceImpl.loadOwnedClient(...)`, transaction client-gate `ClientAccessValidator.requireClientAccessible(...)`, log client-scope checks `services/backend/log/app/client_scope.py`; Tests: `tests/integration/cross-agent-data-isolation.spec.ts`; Infra support: AML/audit DynamoDB keys include entity/client fields (`platform/terraform/modules/dynamodb/main.tf`) |
| Automated testing | Partially Implemented | Yes | N/A | Yes | Yes | Large suite exists across unit/component/integration/performance: `services/backend/*/src/test`, `services/backend/*/tests`, `services/frontend/crm-ui/src/**/__tests__`, `tests/integration/*.spec.ts`, `tests/performance/*`; CI runs many suites (`.github/workflows/ci-main.yml`) but some key perf checks disabled (`ci-frontend.yml`, `ci-performance.yml.disabled`) |

---

## 3) Likely Source-of-Truth Files By Criterion

### Functional scope (mandatory)
- User management
  - `services/backend/user/src/main/java/com/scroogebank/crm/user_service/controller/UserController.java`
  - `services/backend/user/src/main/java/com/scroogebank/crm/user_service/service/UserAccountService.java`
  - `services/frontend/crm-ui/src/api/users.ts`
  - `tests/integration/user-management-advanced.spec.ts`
- Client profile management
  - `services/backend/client/src/main/java/com/scroogebank/crm/client_service/controller/ClientController.java`
  - `services/backend/client/src/main/java/com/scroogebank/crm/client_service/service/ClientServiceImpl.java`
  - `services/frontend/crm-ui/src/api/clients.ts`
  - `tests/integration/client-profile-management.spec.ts`
- Logging + communications
  - `services/backend/log/app/lambda_router.py`
  - `services/backend/log/app/service.py`
  - `services/backend/log/app/repository.py`
  - `services/frontend/crm-ui/src/api/logs.ts`
  - `services/frontend/crm-ui/src/api/communications.ts`
  - `tests/integration/audit-logging.spec.ts`
  - `tests/integration/communication-tracking.spec.ts`
- Transactions + ingestion
  - `services/backend/transaction/src/main/java/com/scroogebank/crm/transaction_service/controller/TransactionsController.java`
  - `services/backend/transaction/src/main/java/com/scroogebank/crm/transaction_service/service/imports/S3BackedTransactionFileSource.java`
  - `services/backend/transaction/src/main/java/com/scroogebank/crm/transaction_service/service/imports/TransactionImportScheduler.java`
  - `services/backend/sftp-transaction-collector/lambda_function.py`
  - `docs/api-contracts/sftp-transaction-ingestion-contract.md`
  - `tests/integration/transaction-management.spec.ts`
- X-factor (AML)
  - `services/backend/aml/lambda_function.py`
  - `services/backend/log/app/lambda_router.py` (AML endpoints + trigger)
  - `services/frontend/crm-ui/src/pages/AmlAlertsPage.tsx`
  - `tests/integration/real-fullstack.spec.ts`

### Non-functional and strongly relevant criteria
- Scalability/performance
  - `platform/terraform/modules/ecs/auto_scaling.tf`
  - `tests/performance/agent-crud-workflow.jmx`
  - `scripts/performance/*.sh`
  - `.github/workflows/ci-frontend.yml` (latency job disabled)
- Availability
  - `platform/terraform/modules/observability/main.tf`
  - `platform/terraform/main.tf` (HA/scaling settings passed into ECS)
  - `.github/workflows/cd-main.yml`
- Maintainability/extensibility
  - `platform/terraform/modules/*`
  - `.github/workflows/reusable-*.yml`
  - `docs/api-contracts/openapi/*.yaml`
- Security
  - `services/backend/user/src/main/java/.../security/JwtService.java`
  - `services/backend/client/src/main/java/.../security/RequestAuth.java`
  - `services/backend/log/app/auth.py`
  - `services/backend/client/src/main/java/.../crypto/EncryptedStringConverter.java`
  - `platform/terraform/modules/security/main.tf`
  - `platform/terraform/modules/security/guardduty.tf`
- Observability
  - `services/backend/log/app/lambda_router.py`
  - `services/backend/verification/lambda_function.py`
  - `platform/terraform/modules/observability/main.tf`
- Durability
  - `platform/terraform/modules/backup/main.tf`
  - `platform/terraform/modules/rds/kms.tf`
  - `platform/terraform/modules/dynamodb/main.tf`
- Agility/CI-CD
  - `.github/workflows/ci-main.yml`
  - `.github/workflows/ci-integration.yml`
  - `.github/workflows/cd-main.yml`
  - `.github/workflows/branch-policy.yml`
- Data segregation
  - `services/backend/client/src/main/java/.../service/ClientServiceImpl.java` (`loadOwnedClient`)
  - `services/backend/transaction/src/main/java/.../service/ClientAccessValidator.java`
  - `services/backend/log/app/client_scope.py`
  - `tests/integration/cross-agent-data-isolation.spec.ts`
- Automated testing
  - `tests/integration/*.spec.ts`
  - `services/backend/*/tests/*.py`
  - `services/backend/*/src/test/java/...`
  - `services/frontend/crm-ui/src/**/__tests__/*`

---

## 4) Missing Evidence Areas (Strict)

1. No single final report artifact in-repo that explicitly maps rubric criteria to evidence and demonstrates end-to-end pass outcomes.
2. CI evidence for frontend latency/performance gates is weak because latency test job is commented out in `.github/workflows/ci-frontend.yml` and `ci-performance` is disabled (`.github/workflows/ci-performance.yml.disabled`).
3. Latest `test_all` summary shows a failed run (`build-logs/test-all/last-run-summary.md` indicates `Success: False` and frontend ESLint failure), so current “all-green” proof is missing.
4. Durability restore proof missing: backup and PITR resources exist in Terraform, but no restore drill logs/results were found.
5. Availability resilience proof missing: alarms and scaling exist, but no explicit failover/chaos/incident simulation test artifacts found.
6. SFTP ingestion “external” proof is partially indirect in repo: architecture supports EC2 SFTP -> S3 -> collector, but repository-local evidence of a full external SFTP demo execution is not explicit.
7. Security verification artifacts (e.g., penetration test report, threat model updates tied to latest code) are not directly present; only static scan/test harnesses and configs are visible.
8. Observability operational proof is partial: instrumentation and alarms exist, but no recent exported dashboards/alert fire-recovery evidence found.
9. Maintainability metrics (e.g., explicit coupling/complexity trend, architecture fitness checks) are not present as measurable artifacts.
10. Some docs are descriptive; rubric-grade defensibility still depends on concrete run artifacts and demonstrations attached to final report submission.

---

## 5) Top 10 Highest-Risk Gaps For Grading

1. Performance/latency evidence not continuously enforced in CI (`ci-frontend` latency block commented; perf workflow disabled).
2. Current full-pipeline evidence is not clean-green (`build-logs/test-all/last-run-summary.md` shows failure).
3. No explicit restore validation evidence for backup/PITR despite infra definitions.
4. No explicit high-availability/failover demo artifacts (only configuration evidence).
5. Final-report-ready rubric mapping artifact was missing before this audit file (grading may expect richer demonstration links).
6. Security posture still needs broader penetration-test/threat-model evidence, but the P0-1 fallback/default PII key risk has been closed (`docs/audits/artifacts/P0-1-pii-encryption-fail-closed-evidence.md`).
7. External SFTP path demonstration is architecture-supported but runtime evidence in repo is not strongly curated for graders.
8. Observability outcomes (alerts triggered/handled, MTTR-style evidence) are not clearly packaged.
9. Maintainability/extensibility is mostly inferred from modular structure; limited measurable proof artifacts.
10. Automated testing breadth is strong, but enforcement inconsistency (disabled perf/latency CI checks) weakens “fully implemented” non-functional claims.

---

## 6) Best-Case Grade Blockers

1. If final submission cannot show a clean, recent, end-to-end pass run covering mandatory functional scope + NFR evidence, grading risk remains high.
2. If evaluators require CI-enforced latency/performance gates, current disabled configuration can block top marks.
3. If evaluators require demonstrated restore/failover exercises (not only Terraform resources), durability/availability marks may be capped.
4. If evaluators scrutinize security hardening details, additional operational security evidence (beyond static/config + P0-1 closure) may still be required.
5. If X-factor grading expects polished demonstration artifact linkage (runbook/video/report references), code-only evidence may not maximize marks.

---

## 7) Questions Unanswered From Repo Alone

1. Were full external SFTP (EC2 endpoint) ingest runs executed successfully in a grading/demo environment, and where are those run artifacts?
2. What is the latest all-green pipeline evidence for full mandatory scope (not just component subsets)?
3. Were backup restore drills and RTO/RPO validations performed? If yes, where are logs/results?
4. Were availability/failover tests (service outage, DB disruption, dependency failure) demonstrated end-to-end?
5. What exact evidence package (screenshots, videos, logs, metrics dashboards) is intended for oral defense/final report?
6. Is production deployment evidence available showing `PII_ENCRYPTION_KEY` is set through runtime secret delivery in each target environment?
7. Are AML false-positive/false-negative quality metrics tracked and reported for the X-factor feature?
8. Which criteria are explicitly claimed in the final report draft versus only present in code/infrastructure?
9. Are communication delivery retries/SLA outcomes monitored and reported in operations evidence?
10. Which environment (local/integration/prod-like) is the official source for grading demonstrations, and is evidence normalized across it?
