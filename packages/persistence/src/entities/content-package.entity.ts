import type { PackageType } from '@richardmcquiston01/reactive-lms-shared';
import { Column, Entity } from 'typeorm';
import { AuditedEntity } from './base.entity';

/**
 * Imported reusable content package (SCORM, xAPI, cmi5, HTML5, H5P, LTI).
 */
@Entity({ name: 'rlms_content_package' })
export class ContentPackage extends AuditedEntity {
  @Column({ name: 'package_type', type: 'text' })
  packageType!: PackageType;

  @Column({ name: 'title', type: 'text' })
  title!: string;

  @Column({ name: 'version', type: 'text', nullable: true })
  version?: string | null;

  @Column({ name: 'entry_href', type: 'text', nullable: true })
  entryHref?: string | null;

  @Column({ name: 'storage_key', type: 'text' })
  storageKey!: string;

  @Column({ name: 'extracted_key', type: 'text', nullable: true })
  extractedKey?: string | null;

  @Column({ name: 'manifest_json', type: 'jsonb' })
  manifestJson!: Record<string, unknown>;

  @Column({ name: 'checksum_sha256', type: 'text', nullable: true })
  checksumSha256?: string | null;
}
