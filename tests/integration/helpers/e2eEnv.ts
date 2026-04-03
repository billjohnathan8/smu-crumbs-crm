import { loadRepoEnvLocal } from "./repoEnv.js";

loadRepoEnvLocal();

export function requireE2eEnv(
  name: "E2E_ADMIN_PASSWORD" | "E2E_USER_PASSWORD",
): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(
      `Missing ${name}. Set it in the environment or repo root .env.local (see .env.example).`,
    );
  }
  return v;
}

/** HS256 secret for verification-token tests; prefers E2E_VERIFICATION_HMAC_SECRET then JWT_HMAC_SECRET. */
export function requireJwtVerificationSecret(): string {
  const v = (
    process.env.E2E_VERIFICATION_HMAC_SECRET ?? process.env.JWT_HMAC_SECRET
  )?.trim();
  if (!v) {
    throw new Error(
      "Missing JWT_HMAC_SECRET (or E2E_VERIFICATION_HMAC_SECRET). Set repo root .env.local — see .env.example.",
    );
  }
  return v;
}
