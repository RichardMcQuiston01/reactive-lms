import { Column, Entity } from 'typeorm';
import { AuditedEntity } from './base.entity';

/**
 * LIS Group — organisation unit or cohort.
 */
@Entity({ name: 'rlms_group' })
export class Group extends AuditedEntity {
  @Column({ name: 'code', type: 'text', nullable: true })
  code?: string | null;

  @Column({ name: 'title', type: 'text' })
  title!: string;

  @Column({ name: 'parent_group_id', type: 'uuid', nullable: true })
  parentGroupId?: string | null;
}
