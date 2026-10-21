import { Column, Entity } from 'typeorm';
import { AuditedEntity } from './base.entity';

/**
 * Section completion rule over placed modules.
 */
export type CompletionRule =
  { allModules: true } | { anyOf: string[] } | { minCompleted: number };

/**
 * Enrollable unit (LIS CourseSection) that holds course modules.
 */
@Entity({ name: 'rlms_course_section' })
export class CourseSection extends AuditedEntity {
  @Column({ name: 'course_offering_id', type: 'uuid' })
  courseOfferingId!: string;

  @Column({ name: 'course_category_id', type: 'uuid', nullable: true })
  courseCategoryId?: string | null;

  @Column({ name: 'title', type: 'text' })
  title!: string;

  @Column({ name: 'completion_rule', type: 'jsonb', nullable: true })
  completionRule?: CompletionRule | Record<string, unknown> | null;
}
