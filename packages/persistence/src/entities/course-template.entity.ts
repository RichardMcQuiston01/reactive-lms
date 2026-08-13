import { Column, Entity } from 'typeorm';
import { AuditedEntity } from './base.entity';

/**
 * LIS CourseTemplate — catalog item reused by dated offerings.
 */
@Entity({ name: 'rlms_course_template' })
export class CourseTemplate extends AuditedEntity {
  @Column({ name: 'code', type: 'text', nullable: true })
  code?: string | null;

  @Column({ name: 'title', type: 'text' })
  title!: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description?: string | null;
}
