import type { ValueTransformer } from 'typeorm';

/**
 * Stores binary content in a portable `text` column as base64.
 *
 * TypeORM has no single binary column type that every driver accepts
 * (PostgreSQL knows `bytea`, MySQL knows `blob`), so entities keep binary
 * bodies as base64 text. xAPI documents are small, so the 33% size overhead is
 * acceptable; a host that needs native binary storage can supply its own
 * dialect migration and transformer.
 */
export const base64BinaryTransformer: ValueTransformer = {
  to(value: Uint8Array | null | undefined): string | null | undefined {
    if (value === null || value === undefined) {
      return value;
    }
    return Buffer.from(value).toString('base64');
  },
  from(value: string | null | undefined): Uint8Array | null | undefined {
    if (value === null || value === undefined) {
      return value;
    }
    return new Uint8Array(Buffer.from(value, 'base64'));
  },
};
