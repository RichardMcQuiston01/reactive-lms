import { Column, Entity } from 'typeorm';
import { AuditedEntity } from './base.entity';

/**
 * Catalog grouping for course sections (Moodle category / Forma catalog).
 */
@Entity({ name: 'rlms_course_category' })
export class CourseCategory extends AuditedEntity {
  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId?: string | null;

  @Column({ name: 'title', type: 'text' })
  title!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;
}
