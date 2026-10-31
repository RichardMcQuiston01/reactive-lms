import type {
  CompletionStatus,
  SuccessStatus,
} from '@richardmcquiston01/reactive-lms-shared';
import { Column, Entity } from 'typeorm';
import { TimestampedEntity } from './base.entity';

/**
 * Rolled-up progress per registration × module × activity node.
 */
@Entity({ name: 'rlms_normalized_progress' })
export class NormalizedProgress extends TimestampedEntity {
  @Column({ name: 'registration_id', type: 'uuid' })
  registrationId!: string;

  @Column({ name: 'course_module_id', type: 'uuid' })
  courseModuleId!: string;

  @Column({ name: 'activity_node_id', type: 'uuid' })
  activityNodeId!: string;

  @Column({ name: 'completion_status', type: 'text' })
  completionStatus!: CompletionStatus;

  @Column({ name: 'success_status', type: 'text' })
  successStatus!: SuccessStatus;

  @Column({
    name: 'score_scaled',
    type: 'decimal',
    precision: 14,
    scale: 6,
    nullable: true,
  })
  scoreScaled?: string | null;

  @Column({
    name: 'score_raw',
    type: 'decimal',
    precision: 14,
    scale: 6,
    nullable: true,
  })
  scoreRaw?: string | null;

  @Column({
    name: 'score_min',
    type: 'decimal',
    precision: 14,
    scale: 6,
    nullable: true,
  })
  scoreMin?: string | null;

  @Column({
    name: 'score_max',
    type: 'decimal',
    precision: 14,
    scale: 6,
    nullable: true,
  })
  scoreMax?: string | null;

  @Column({
    name: 'progress_measure',
    type: 'decimal',
    precision: 14,
    scale: 6,
    nullable: true,
  })
  progressMeasure?: string | null;

  @Column({ name: 'location', type: 'text', nullable: true })
  location?: string | null;

  @Column({ name: 'total_time_iso8601', type: 'text', nullable: true })
  totalTimeIso8601?: string | null;

  @Column({ name: 'suspend_data', type: 'text', nullable: true })
  suspendData?: string | null;

  @Column({ name: 'extras_json', type: 'json', nullable: true })
  extrasJson?: Record<string, unknown> | null;
}
