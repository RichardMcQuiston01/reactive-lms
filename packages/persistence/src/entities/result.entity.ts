import { Column, Entity } from 'typeorm';
import { AuditedEntity } from './base.entity';

/**
 * LIS / LTI AGS score for a person on a line item.
 */
@Entity({ name: 'rlms_result' })
export class Result extends AuditedEntity {
  @Column({ name: 'line_item_id', type: 'uuid' })
  lineItemId!: string;

  @Column({ name: 'person_id', type: 'uuid' })
  personId!: string;

  @Column({ name: 'score_given', type: 'numeric', nullable: true })
  scoreGiven?: string | null;

  @Column({ name: 'score_maximum', type: 'numeric', nullable: true })
  scoreMaximum?: string | null;

  @Column({ name: 'activity_progress', type: 'text', nullable: true })
  activityProgress?: string | null;

  @Column({ name: 'grading_progress', type: 'text', nullable: true })
  gradingProgress?: string | null;
}
