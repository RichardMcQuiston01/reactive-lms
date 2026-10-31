import type { RegistrationStatus } from '@richardmcquiston01/reactive-lms-shared';
import { Column, Entity, Unique } from 'typeorm';
import { AuditedEntity } from './base.entity';

/**
 * One person enrolled on one course section.
 */
@Entity({ name: 'rlms_registration' })
@Unique('uq_rlms_registration_person_section', ['personId', 'courseSectionId'])
export class Registration extends AuditedEntity {
  @Column({ name: 'person_id', type: 'uuid' })
  personId!: string;

  @Column({ name: 'course_section_id', type: 'uuid' })
  courseSectionId!: string;

  @Column({ name: 'enrolment_method_id', type: 'uuid', nullable: true })
  enrolmentMethodId?: string | null;

  @Column({ name: 'status', type: 'text' })
  status!: RegistrationStatus;

  @Column({
    name: 'score_scaled',
    type: 'decimal',
    precision: 14,
    scale: 6,
    nullable: true,
  })
  scoreScaled?: string | null;

  @Column({ name: 'duration_iso8601', type: 'text', nullable: true })
  durationIso8601?: string | null;
}
