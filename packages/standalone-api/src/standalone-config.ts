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
