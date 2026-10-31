import { Column, Entity } from 'typeorm';
import { AuditedEntity } from './base.entity';

/**
 * LIS / LTI Assignment and Grade Services gradebook column.
 */
@Entity({ name: 'rlms_line_item' })
export class LineItem extends AuditedEntity {
  @Column({ name: 'course_section_id', type: 'uuid' })
  courseSectionId!: string;

  @Column({ name: 'course_module_id', type: 'uuid', nullable: true })
  courseModuleId?: string | null;

  @Column({ name: 'activity_node_id', type: 'uuid', nullable: true })
  activityNodeId?: string | null;

  @Column({ name: 'label', type: 'text' })
  label!: string;

  @Column({
    name: 'score_maximum',
    type: 'decimal',
    precision: 14,
    scale: 6,
    nullable: true,
  })
  scoreMaximum?: string | null;

  @Column({ name: 'resource_id', type: 'text', nullable: true })
  resourceId?: string | null;

  @Column({ name: 'tag', type: 'text', nullable: true })
  tag?: string | null;
}
