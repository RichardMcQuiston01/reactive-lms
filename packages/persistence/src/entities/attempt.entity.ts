import type { LaunchMode } from '@richardmcquiston01/reactive-lms-shared';
import { Column, Entity } from 'typeorm';
import { TimestampedEntity } from './base.entity';

/**
 * How an attempt ended (or that it is still open).
 */
export type AttemptTermination = 'terminated' | 'abandoned' | 'still_open';

/**
 * One launch session against one course module.
 */
@Entity({ name: 'rlms_attempt' })
export class Attempt extends TimestampedEntity {
  @Column({ name: 'registration_id', type: 'uuid' })
  registrationId!: string;

  @Column({ name: 'course_module_id', type: 'uuid' })
  courseModuleId!: string;

  @Column({ name: 'activity_node_id', type: 'uuid', nullable: true })
  activityNodeId?: string | null;

  @Column({ name: 'session_id', type: 'text', unique: true })
  sessionId!: string;

  @Column({ name: 'launch_mode', type: 'text' })
  launchMode!: LaunchMode;

  @Column({ name: 'started_at', type: Date, nullable: true })
  startedAt?: Date | null;

  @Column({ name: 'ended_at', type: Date, nullable: true })
  endedAt?: Date | null;

  @Column({ name: 'termination', type: 'text', nullable: true })
  termination?: AttemptTermination | null;
}
