import { Column, Entity } from 'typeorm';
import { AuditedEntity } from './base.entity';

/**
 * How a person becomes registered on a course section.
 */
export type EnrolmentMethodKind = 'manual' | 'self' | 'group' | 'host_sync';

/**
 * Enrolment plugin configuration for a course section.
 */
@Entity({ name: 'rlms_enrolment_method' })
export class EnrolmentMethod extends AuditedEntity {
  @Column({ name: 'course_section_id', type: 'uuid' })
  courseSectionId!: string;

  @Column({ name: 'method', type: 'text' })
  method!: EnrolmentMethodKind;

  @Column({ name: 'config_json', type: 'json', nullable: true })
  configJson?: Record<string, unknown> | null;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled!: boolean;
}
