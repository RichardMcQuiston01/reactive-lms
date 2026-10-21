import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Append-only audit event (import, launch, grade, enrol, waive, delete).
 */
@Entity({ name: 'rlms_event_log' })
export class EventLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'person_id', type: 'uuid', nullable: true })
  personId?: string | null;

  @Column({ name: 'action', type: 'text' })
  action!: string;

  @Column({ name: 'subject_type', type: 'text', nullable: true })
  subjectType?: string | null;

  @Column({ name: 'subject_id', type: 'uuid', nullable: true })
  subjectId?: string | null;

  @Column({ name: 'payload_json', type: 'jsonb', nullable: true })
  payloadJson?: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
