import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Immutable xAPI statement stored by the LRS. There is no update path.
 */
@Entity({ name: 'rlms_xapi_statement' })
export class XapiStatement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'registration_id', type: 'uuid', nullable: true })
  registrationId?: string | null;

  @Column({ name: 'attempt_id', type: 'uuid', nullable: true })
  attemptId?: string | null;

  @Column({ name: 'actor_json', type: 'json', nullable: true })
  actorJson?: Record<string, unknown> | null;

  @Column({ name: 'verb_iri', type: 'text', nullable: true })
  verbIri?: string | null;

  @Column({ name: 'object_json', type: 'json', nullable: true })
  objectJson?: Record<string, unknown> | null;

  @Column({ name: 'result_json', type: 'json', nullable: true })
  resultJson?: Record<string, unknown> | null;

  @Column({ name: 'context_json', type: 'json', nullable: true })
  contextJson?: Record<string, unknown> | null;

  @Column({ name: 'timestamp', type: Date, nullable: true })
  timestamp?: Date | null;

  @Column({ name: 'stored_at', type: Date, nullable: true })
  storedAt?: Date | null;

  @Column({ name: 'authority_json', type: 'json', nullable: true })
  authorityJson?: Record<string, unknown> | null;

  @Column({ name: 'voided', type: 'boolean', default: false })
  voided!: boolean;

  @Column({ name: 'raw_json', type: 'json' })
  rawJson!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: Date })
  createdAt!: Date;
}
