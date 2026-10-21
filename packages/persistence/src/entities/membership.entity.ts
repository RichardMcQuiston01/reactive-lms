import { Column, Entity } from 'typeorm';
import { AuditedEntity } from './base.entity';

/**
 * Contextual role a person holds in a group or course section.
 */
export type MembershipRole =
  'learner' | 'instructor' | 'administrator' | 'content_developer';

/**
 * Collection a membership row points at.
 */
export type MembershipCollectionType = 'group' | 'course_section';

/**
 * Person membership in a LIS Group or course section.
 */
@Entity({ name: 'rlms_membership' })
export class Membership extends AuditedEntity {
  @Column({ name: 'person_id', type: 'uuid' })
  personId!: string;

  @Column({ name: 'collection_type', type: 'text' })
  collectionType!: MembershipCollectionType;

  @Column({ name: 'collection_id', type: 'uuid' })
  collectionId!: string;

  @Column({ name: 'role', type: 'text' })
  role!: MembershipRole;
}
