import { Column, Entity } from 'typeorm';
import { AuditedEntity } from './base.entity';

/**
 * Host-mapped person (LIS Person). Passwords are never stored here.
 */
@Entity({ name: 'rlms_person' })
export class Person extends AuditedEntity {
  @Column({ name: 'external_id', type: 'text', unique: true })
  externalId!: string;

  @Column({ name: 'display_name', type: 'text', nullable: true })
  displayName?: string | null;

  @Column({ name: 'account_homepage', type: 'text', nullable: true })
  accountHomepage?: string | null;

  @Column({ name: 'account_name', type: 'text', nullable: true })
  accountName?: string | null;

  @Column({ name: 'email', type: 'text', nullable: true })
  email?: string | null;
}
