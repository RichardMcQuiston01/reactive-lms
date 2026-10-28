import path from 'node:path';

/**
 * Resolves the filesystem dataroot from `RLMS_DATAROOT` or `DATAROOT`.
 */
export function resolveDataRoot(): string {
  const raw =
    process.env['RLMS_DATAROOT'] ?? process.env['DATAROOT'] ?? './data';
  return path.resolve(raw);
}

/**
 * Builds a Postgres URL from `RLMS_DATABASE_URL` or `DATABASE_*` parts.
 */
export function resolveDatabaseUrl(): string {
  const explicit =
    process.env['RLMS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (explicit) {
    return explicit;
  }
  const host = process.env['DATABASE_HOST'] ?? 'localhost';
  const port = process.env['DATABASE_PORT'] ?? '5432';
  const user = process.env['DATABASE_USER'] ?? 'rlms';
  const password = process.env['DATABASE_PASSWORD'] ?? 'rlms';
  const name = process.env['DATABASE_NAME'] ?? 'rlms';
  return `postgres://${user}:${password}@${host}:${port}/${name}`;
}

/**
 * Outcome of {@link resolveRunMigrations}.
 */
export type RunMigrationsResult =
  { ok: true; value: boolean } | { ok: false; error: string };

/**
 * Reads `RLMS_RUN_MIGRATIONS`. Standalone owns its database, so pending
 * migrations run on start unless this is set to a false value (`false`, `0`,
 * `no`, `off`). Turn it off when migrations are applied separately, and when
 * running several API processes against one database, start one process
 * first so two do not migrate at once.
 *
 * @param env - Environment to read; defaults to `process.env`
 * @returns The setting, or an error naming the variable and the bad value
 */
export function resolveRunMigrations(
  env: Record<string, string | undefined> = process.env,
): RunMigrationsResult {
  const raw = env['RLMS_RUN_MIGRATIONS']?.trim().toLowerCase();
  if (raw === undefined || raw === '') {
    return { ok: true, value: true };
  }
  if (['true', '1', 'yes', 'on'].includes(raw)) {
    return { ok: true, value: true };
  }
  if (['false', '0', 'no', 'off'].includes(raw)) {
    return { ok: true, value: false };
  }
  return {
    ok: false,
    error: `RLMS_RUN_MIGRATIONS is "${env['RLMS_RUN_MIGRATIONS']}", which is not recognised. Use true or false.`,
  };
}
