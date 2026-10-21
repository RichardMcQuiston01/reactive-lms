import {
  Column,
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * UUID primary key shared by every `rlms_*` table.
 */
export abstract class IdentifiedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
}

/**
 * Identified row with created_at / updated_at.
 */
export abstract class TimestampedEntity extends IdentifiedEntity {
  @CreateDateColumn({ name: 'created_at', type: Date })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: Date })
  updatedAt!: Date;
}

/**
 * User-modifiable row with host audit user ids.
 */
export abstract class AuditedEntity extends TimestampedEntity {
  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId?: string | null;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId?: string | null;
}
