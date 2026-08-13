import { Column, Entity } from 'typeorm';
import { AuditedEntity } from './base.entity';

/**
 * Conditional availability for a module placement.
 */
export type ModuleAvailability = {
  afterModuleId?: string;
  availableFrom?: string;
  availableUntil?: string;
  minScore?: number;
};

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

  @Column({ name: 'availability_json', type: 'jsonb', nullable: true })
  availabilityJson?: ModuleAvailability | Record<string, unknown> | null;
}
