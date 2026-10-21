import { Column, Entity } from 'typeorm';
import { AuditedEntity } from './base.entity';

/**
 * LTI 1.3 platform (this LMS) registration of a tool deployment.
 */
@Entity({ name: 'rlms_lti_platform_deployment' })
export class LtiPlatformDeployment extends AuditedEntity {
  @Column({ name: 'issuer', type: 'text' })
  issuer!: string;

  @Column({ name: 'client_id', type: 'text' })
  clientId!: string;

  @Column({ name: 'deployment_id', type: 'text' })
  deploymentId!: string;

  @Column({ name: 'auth_login_url', type: 'text' })
  authLoginUrl!: string;

  @Column({ name: 'auth_token_url', type: 'text' })
  authTokenUrl!: string;

  @Column({ name: 'jwks_url', type: 'text' })
  jwksUrl!: string;

  @Column({ name: 'tool_jwks_json', type: 'jsonb', nullable: true })
  toolJwksJson?: Record<string, unknown> | null;

  @Column({ name: 'platform_key_id', type: 'text', nullable: true })
  platformKeyId?: string | null;
}
