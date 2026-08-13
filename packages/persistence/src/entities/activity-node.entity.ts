import { Column, Entity } from 'typeorm';
import { TimestampedEntity } from './base.entity';

/**
 * Flattened activity tree node (SCO / AU / H5P item / LTI resource).
 */
@Entity({ name: 'rlms_activity_node' })
export class ActivityNode extends TimestampedEntity {
  @Column({ name: 'content_package_id', type: 'uuid' })
  contentPackageId!: string;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId?: string | null;

  @Column({ name: 'publisher_id', type: 'text', nullable: true })
  publisherId?: string | null;

  @Column({ name: 'activity_iri', type: 'text', nullable: true })
  activityIri?: string | null;

  @Column({ name: 'title', type: 'text' })
  title!: string;

  @Column({ name: 'href', type: 'text', nullable: true })
  href?: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'metadata_json', type: 'jsonb', nullable: true })
  metadataJson?: Record<string, unknown> | null;
}
