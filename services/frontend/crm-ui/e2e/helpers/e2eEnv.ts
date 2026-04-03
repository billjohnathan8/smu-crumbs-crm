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
