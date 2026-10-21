import type {
  AvailabilityV0,
  AvailabilityV1,
} from '@richardmcquiston01/reactive-lms-shared';
import { Column, Entity } from 'typeorm';
import { AuditedEntity } from './base.entity';

/**
 * Version 0 availability, the single-object shape used before conditions
 * became a versioned list. Existing rows may still hold it; it is upcast to
 * version 1 when read.
 *
 * @deprecated Write {@link AvailabilityV1} rules instead.
 */
export type ModuleAvailability = AvailabilityV0;

/**
 * One activity placed in a section (Moodle-style course module).
 */
@Entity({ name: 'rlms_course_module' })
export class CourseModule extends AuditedEntity {
  @Column({ name: 'course_section_id', type: 'uuid' })
  courseSectionId!: string;

  @Column({ name: 'content_package_id', type: 'uuid' })
  contentPackageId!: string;

  @Column({ name: 'activity_node_id', type: 'uuid', nullable: true })
  activityNodeId?: string | null;

  @Column({ name: 'title', type: 'text' })
  title!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'availability_json', type: 'json', nullable: true })
  availabilityJson?: AvailabilityV1 | ModuleAvailability | null;
}
