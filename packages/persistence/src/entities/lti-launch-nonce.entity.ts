import { Column, Entity } from 'typeorm';
import { TimestampedEntity } from './base.entity';

/**
 * One-time LTI launch nonce used for replay protection.
 */
@Entity({ name: 'rlms_lti_launch_nonce' })
export class LtiLaunchNonce extends TimestampedEntity {
  @Column({ name: 'nonce', type: 'text', unique: true })
  nonce!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;
}
