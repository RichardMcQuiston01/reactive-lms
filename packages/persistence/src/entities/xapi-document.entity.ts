import { Column, Entity } from 'typeorm';
import { TimestampedEntity } from './base.entity';

/**
 * xAPI document resource kind (State / Agent Profile / Activity Profile).
 */
export type XapiDocumentKind = 'state' | 'agent_profile' | 'activity_profile';

/**
 * xAPI State, Agent Profile, or Activity Profile document.
 *
 * Uniqueness is only the COALESCE unique index `uq_rlms_xapi_document_key`
 * in `0001-initial-schema` (kind + activity + agent + registration +
 * state/profile id). No entity `@Unique` — Postgres treats NULLs as
 * distinct, which would drift from xAPI document identity.
 */
@Entity({ name: 'rlms_xapi_document' })
export class XapiDocument extends TimestampedEntity {
  @Column({ name: 'document_kind', type: 'text' })
  documentKind!: XapiDocumentKind;

  @Column({ name: 'activity_iri', type: 'text', nullable: true })
  activityIri?: string | null;

  @Column({ name: 'agent_json', type: 'jsonb', nullable: true })
  agentJson?: Record<string, unknown> | null;

  @Column({ name: 'registration_id', type: 'uuid', nullable: true })
  registrationId?: string | null;

  @Column({ name: 'state_id', type: 'text', nullable: true })
  stateId?: string | null;

  @Column({ name: 'profile_id', type: 'text', nullable: true })
  profileId?: string | null;

  @Column({ name: 'content_type', type: 'text', nullable: true })
  contentType?: string | null;

  @Column({ name: 'body', type: 'bytea', nullable: true })
  body?: Uint8Array | null;

  @Column({ name: 'etag', type: 'text', nullable: true })
  etag?: string | null;
}
