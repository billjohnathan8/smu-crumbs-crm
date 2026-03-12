# Stateful Service Scaling Rules

## Current Rule (Safe Default)

The `agent` and `transaction` backend services currently keep critical runtime state in process memory:

- `agent`: user mutations and refresh token state
- `transaction`: transaction/import records (and auth/user state used by transaction auth endpoints)

Terraform keeps the safe default (`single replica`, `no scale-out`) unless explicitly enabled:

- `agent` desired count = `1`
- `transaction` desired count = `1`
- No ECS autoscaling resources for `agent` or `transaction` (scale-out disabled)
- `enable_stateful_service_scale_out = false`

These guardrails are implemented in:

- `platform/terraform/variables.tf`
- `platform/terraform/modules/ecs/main.tf`
- `platform/terraform/modules/ecs/auto_scaling.tf`

## Phase B Implementation Status

Phase B persistence has been implemented:

- `agent` now supports PostgreSQL-backed storage for users and refresh tokens.
- `transaction` now supports PostgreSQL-backed storage for transaction and import batch records.
- Terraform sets production ECS env vars to use persistent store mode (`postgres`).

Backend implementation files:

- `services/backend/agent/src/main/java/com/scroogebank/crm/agentservice/service/PersistentUserStore.java`
- `services/backend/transaction/src/main/java/com/scroogebank/crm/transaction_service/service/PersistentTransactionsStore.java`

## Re-enabling Multi-Replica

To allow horizontal scaling:

1. Keep persistence mode enabled in ECS env vars (`APP_USER_STORE_TYPE=postgres`, `APP_TRANSACTIONS_STORE_TYPE=postgres`).
2. Set `enable_stateful_service_scale_out = true`.
3. Increase `agent_desired_count` and/or `transaction_desired_count`.
4. Optionally tune autoscaling min/max capacities.

Verification requirements before enabling in production:

- Agent refresh tokens survive task restarts and are valid across replicas.
- Transaction and import batch records survive task restarts and are visible across replicas.
