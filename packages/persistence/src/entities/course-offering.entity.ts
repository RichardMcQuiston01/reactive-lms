import { Column, Entity } from 'typeorm';
import { AuditedEntity } from './base.entity';

/**
 * Dated run of a course template (LIS CourseOffering).
 */
@Entity({ name: 'rlms_course_offering' })
export class CourseOffering extends AuditedEntity {
  @Column({ name: 'course_template_id', type: 'uuid' })
  courseTemplateId!: string;

  @Column({ name: 'title', type: 'text' })
  title!: string;

  @Column({ name: 'starts_at', type: Date, nullable: true })
  startsAt?: Date | null;

  @Column({ name: 'ends_at', type: Date, nullable: true })
  endsAt?: Date | null;
}
