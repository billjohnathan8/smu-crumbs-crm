import { type APIRequestContext } from "@playwright/test";
import { authHeaders, expectOkJson, pollUntil } from "./apiClient";

type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "READ";
type ImportBatchStatus = "queued" | "running" | "completed" | "failed";

interface WaitAuditLogInput {
  clientId: string;
  action: AuditAction;
  limit?: number;
  timeoutMs?: number;
  intervalMs?: number;
}

interface WaitClientByEmailInput {
  emailAddress: string;
  limit?: number;
  timeoutMs?: number;
  intervalMs?: number;
}

interface WaitImportBatchInput {
  importBatchId: string;
  timeoutMs?: number;
  intervalMs?: number;
}

interface AuditLogRow {
  logId: string;
  clientId: string;
  action: string;
}

interface ImportBatch {
  importBatchId: string;
  status: ImportBatchStatus;
  totalRecords: number;
  importedRecords: number;
  failedRecords: number;
}

export async function waitForAuditLogAction(
  request: APIRequestContext,
  baseURL: string,
  userAccessToken: string,
  input: WaitAuditLogInput,
): Promise<AuditLogRow> {
  const payload = await pollUntil(
    async () => {
      const response = await request.get(
        `${baseURL}/api/logs?clientId=${input.clientId}&limit=${input.limit ?? 100}`,
        { headers: authHeaders(userAccessToken) },
      );
      return expectOkJson<{ data?: AuditLogRow[] }>(response, "poll audit logs");
    },
    (body) =>
      Boolean(body.data?.some((row) => row.clientId === input.clientId && row.action === input.action)),
    {
      timeoutMs: input.timeoutMs,
      intervalMs: input.intervalMs,
      description: `audit log ${input.action} for client ${input.clientId}`,
    },
  );

  const match = payload.data?.find((row) => row.clientId === input.clientId && row.action === input.action);
  if (!match) {
    throw new Error(`Audit log ${input.action} not found for client ${input.clientId}`);
  }
  return match;
}

export async function waitForClientByEmail(
  request: APIRequestContext,
  baseURL: string,
  userAccessToken: string,
  input: WaitClientByEmailInput,
): Promise<{ clientId: string; emailAddress: string }> {
  const payload = await pollUntil(
    async () => {
      const response = await request.get(
        `${baseURL}/api/clients?limit=${input.limit ?? 200}&offset=0`,
        { headers: authHeaders(userAccessToken) },
      );
      return expectOkJson<{ data?: Array<{ clientId: string; emailAddress: string }> }>(
        response,
        "list clients",
      );
    },
    (body) =>
      Boolean(
        body.data?.some(
          (row) => row.emailAddress.toLowerCase() === input.emailAddress.toLowerCase(),
        ),
      ),
    {
      timeoutMs: input.timeoutMs,
      intervalMs: input.intervalMs,
      description: `client lookup by email ${input.emailAddress}`,
    },
  );

  const match = payload.data?.find(
    (row) => row.emailAddress.toLowerCase() === input.emailAddress.toLowerCase(),
  );
  if (!match) {
    throw new Error(`Client with email ${input.emailAddress} was not found`);
  }
  return match;
}

export async function waitForImportBatchTerminalState(
  request: APIRequestContext,
  baseURL: string,
  adminAccessToken: string,
  input: WaitImportBatchInput,
): Promise<ImportBatch> {
  const payload = await pollUntil(
    async () => {
      const response = await request.get(
        `${baseURL}/api/transactions/imports/${input.importBatchId}`,
        { headers: authHeaders(adminAccessToken) },
      );
      return expectOkJson<ImportBatch>(response, "poll import batch status");
    },
    (batch) => batch.status === "completed" || batch.status === "failed",
    {
      timeoutMs: input.timeoutMs ?? 30_000,
      intervalMs: input.intervalMs ?? 1_000,
      description: `import batch ${input.importBatchId} terminal status`,
    },
  );

  return payload;
}

