import { expect, type APIRequestContext, type APIResponse } from "@playwright/test";

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
}

export interface PollOptions {
  timeoutMs?: number;
  intervalMs?: number;
  description?: string;
}

export function normalizeBaseURL(baseURL: string | undefined): string {
  const value = (baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "").trim();
  if (!value) {
    throw new Error("Playwright baseURL is required for integration tests");
  }
  return value.replace(/\/+$/, "");
}

export async function expectOkJson<T>(response: APIResponse, operation: string): Promise<T> {
  const body = await response.text();
  expect(
    response.ok(),
    `${operation} failed: ${response.status()} ${response.statusText()}\n${body}`,
  ).toBeTruthy();
  return (body ? JSON.parse(body) : {}) as T;
}

export async function loginViaApi(
  request: APIRequestContext,
  baseURL: string,
  email: string,
  password: string,
): Promise<TokenResponse> {
  const response = await request.post(`${baseURL}/api/auth/login`, {
    data: { email, password },
  });
  const tokens = await expectOkJson<TokenResponse>(response, `login as ${email}`);
  expect(tokens.accessToken, `No access token returned for ${email}`).toBeTruthy();
  return tokens;
}

export async function refreshViaApi(
  request: APIRequestContext,
  baseURL: string,
  refreshToken: string,
): Promise<TokenResponse> {
  const response = await request.post(`${baseURL}/api/auth/refresh`, {
    data: { refreshToken },
  });
  const tokens = await expectOkJson<TokenResponse>(response, "refresh access token");
  expect(tokens.accessToken, "No access token returned from refresh").toBeTruthy();
  return tokens;
}

export function authHeaders(accessToken: string): { Authorization: string } {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function pollUntil<T>(
  producer: () => Promise<T>,
  isDone: (value: T) => boolean,
  options?: PollOptions,
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const intervalMs = options?.intervalMs ?? 1_000;
  const description = options?.description ?? "condition";
  const startedAt = Date.now();
  let lastValue: T | undefined;

  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await producer();
    if (isDone(lastValue)) {
      return lastValue;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }

  throw new Error(`Timed out waiting for ${description} after ${timeoutMs}ms`);
}

