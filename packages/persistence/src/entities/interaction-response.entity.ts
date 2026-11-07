import { Column, Entity, Index, Unique } from 'typeorm';
import { TimestampedEntity } from './base.entity';

/**
 * One answer a SCO reported through `cmi.interactions.n.*`, kept per attempt
 * so a learner's answers can be reviewed after the SCO closes. Rows for an
 * attempt are replaced together each time that attempt reports interactions.
 */
@Unique('uq_rlms_interaction_response_slot', ['attemptId', 'interactionIndex'])
@Index('ix_rlms_interaction_response_registration', ['registrationId'])
@Index('ix_rlms_interaction_response_attempt', ['attemptId'])
@Entity({ name: 'rlms_interaction_response' })
export class InteractionResponse extends TimestampedEntity {
  @Column({ name: 'attempt_id', type: 'uuid' })
  attemptId!: string;

  @Column({ name: 'registration_id', type: 'uuid' })
  registrationId!: string;

  @Column({ name: 'course_module_id', type: 'uuid' })
  courseModuleId!: string;

  @Column({ name: 'activity_node_id', type: 'uuid', nullable: true })
  activityNodeId?: string | null;

  /** The SCO's own `n` for this interaction (0-based, in report order). */
  @Column({ name: 'interaction_index', type: 'int' })
  interactionIndex!: number;

  /** `cmi.interactions.n.id`. */
  @Column({ name: 'interaction_id', type: 'text', nullable: true })
  interactionId?: string | null;

  /** `true-false`, `choice`, `fill-in`, `matching`, `performance`, `sequencing`, `likert` or `numeric`. */
  @Column({ name: 'interaction_type', type: 'text', nullable: true })
  interactionType?: string | null;

  /** Objective ids the interaction counts toward. */
  @Column({ name: 'objective_ids', type: 'json' })
  objectiveIds!: string[];

  /** Accepted answers, as the SCO wrote them. */
  @Column({ name: 'correct_patterns', type: 'json' })
  correctPatterns!: string[];

  /** `cmi.interactions.n.time`, `HH:MM:SS`. */
  @Column({ name: 'time_of_day', type: 'text', nullable: true })
  timeOfDay?: string | null;

  @Column({ name: 'student_response', type: 'text', nullable: true })
  studentResponse?: string | null;

  /** `correct`, `wrong`, `unanticipated`, `neutral`, or a number as text. */
  @Column({ name: 'result', type: 'text', nullable: true })
  result?: string | null;

  @Column({ name: 'weighting', type: 'text', nullable: true })
  weighting?: string | null;

  /** `cmi.interactions.n.latency`, `HHHH:MM:SS`. */
  @Column({ name: 'latency', type: 'text', nullable: true })
  latency?: string | null;
}
