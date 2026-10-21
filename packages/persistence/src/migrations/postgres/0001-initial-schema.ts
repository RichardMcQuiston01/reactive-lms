import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the initial LIS-shaped `rlms_*` schema.
 */
export class InitialSchema0001 implements MigrationInterface {
  // TypeORM orders migrations by the 13-digit timestamp at the end of `name`.
  name = 'InitialSchema1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // gen_random_uuid() is in core PostgreSQL 13+; do not CREATE EXTENSION.
    await queryRunner.query(`
      CREATE TABLE "rlms_person" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "external_id" text NOT NULL,
        "display_name" text,
        "account_homepage" text,
        "account_name" text,
        "email" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        CONSTRAINT "pk_rlms_person" PRIMARY KEY ("id"),
        CONSTRAINT "uq_rlms_person_external_id" UNIQUE ("external_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rlms_group" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "code" text,
        "title" text NOT NULL,
        "parent_group_id" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        CONSTRAINT "pk_rlms_group" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rlms_membership" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "person_id" uuid NOT NULL,
        "collection_type" text NOT NULL,
        "collection_id" uuid NOT NULL,
        "role" text NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        CONSTRAINT "pk_rlms_membership" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rlms_course_template" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "code" text,
        "title" text NOT NULL,
        "description" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        CONSTRAINT "pk_rlms_course_template" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rlms_course_offering" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "course_template_id" uuid NOT NULL,
        "title" text NOT NULL,
        "starts_at" TIMESTAMPTZ,
        "ends_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        CONSTRAINT "pk_rlms_course_offering" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rlms_course_category" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "parent_id" uuid,
        "title" text NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        CONSTRAINT "pk_rlms_course_category" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rlms_course_section" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "course_offering_id" uuid NOT NULL,
        "course_category_id" uuid,
        "title" text NOT NULL,
        "completion_rule" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        CONSTRAINT "pk_rlms_course_section" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rlms_content_package" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "package_type" text NOT NULL,
        "title" text NOT NULL,
        "version" text,
        "entry_href" text,
        "storage_key" text NOT NULL,
        "extracted_key" text,
        "manifest_json" jsonb NOT NULL,
        "checksum_sha256" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        CONSTRAINT "pk_rlms_content_package" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rlms_activity_node" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "content_package_id" uuid NOT NULL,
        "parent_id" uuid,
        "publisher_id" text,
        "activity_iri" text,
        "title" text NOT NULL,
        "href" text,
        "sort_order" integer NOT NULL DEFAULT 0,
        "metadata_json" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_rlms_activity_node" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rlms_course_module" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "course_section_id" uuid NOT NULL,
        "content_package_id" uuid NOT NULL,
        "activity_node_id" uuid,
        "title" text NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "availability_json" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        CONSTRAINT "pk_rlms_course_module" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rlms_enrolment_method" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "course_section_id" uuid NOT NULL,
        "method" text NOT NULL,
        "config_json" jsonb,
        "is_enabled" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        CONSTRAINT "pk_rlms_enrolment_method" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rlms_registration" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "person_id" uuid NOT NULL,
        "course_section_id" uuid NOT NULL,
        "enrolment_method_id" uuid,
        "status" text NOT NULL,
        "score_scaled" numeric,
        "duration_iso8601" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        CONSTRAINT "pk_rlms_registration" PRIMARY KEY ("id"),
        CONSTRAINT "uq_rlms_registration_person_section"
          UNIQUE ("person_id", "course_section_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rlms_attempt" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "registration_id" uuid NOT NULL,
        "course_module_id" uuid NOT NULL,
        "activity_node_id" uuid,
        "session_id" text NOT NULL,
        "launch_mode" text NOT NULL,
        "started_at" TIMESTAMPTZ,
        "ended_at" TIMESTAMPTZ,
        "termination" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_rlms_attempt" PRIMARY KEY ("id"),
        CONSTRAINT "uq_rlms_attempt_session_id" UNIQUE ("session_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rlms_normalized_progress" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "registration_id" uuid NOT NULL,
        "course_module_id" uuid NOT NULL,
        "activity_node_id" uuid NOT NULL,
        "completion_status" text NOT NULL,
        "success_status" text NOT NULL,
        "score_scaled" numeric,
        "score_raw" numeric,
        "score_min" numeric,
        "score_max" numeric,
        "progress_measure" numeric,
        "location" text,
        "total_time_iso8601" text,
        "suspend_data" text,
        "extras_json" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_rlms_normalized_progress" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rlms_line_item" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "course_section_id" uuid NOT NULL,
        "course_module_id" uuid,
        "activity_node_id" uuid,
        "label" text NOT NULL,
        "score_maximum" numeric,
        "resource_id" text,
        "tag" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        CONSTRAINT "pk_rlms_line_item" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rlms_result" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "line_item_id" uuid NOT NULL,
        "person_id" uuid NOT NULL,
        "score_given" numeric,
        "score_maximum" numeric,
        "activity_progress" text,
        "grading_progress" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        CONSTRAINT "pk_rlms_result" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rlms_xapi_statement" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "registration_id" uuid,
        "attempt_id" uuid,
        "actor_json" jsonb,
        "verb_iri" text,
        "object_json" jsonb,
        "result_json" jsonb,
        "context_json" jsonb,
        "timestamp" TIMESTAMPTZ,
        "stored_at" TIMESTAMPTZ,
        "authority_json" jsonb,
        "voided" boolean NOT NULL DEFAULT false,
        "raw_json" jsonb NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_rlms_xapi_statement" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rlms_xapi_document" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "document_kind" text NOT NULL,
        "activity_iri" text,
        "agent_json" jsonb,
        "registration_id" uuid,
        "state_id" text,
        "profile_id" text,
        "content_type" text,
        "body" text,
        "etag" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_rlms_xapi_document" PRIMARY KEY ("id")
      )
    `);

    // Sole definition of xAPI document identity (entity has no @Unique).
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_rlms_xapi_document_key"
      ON "rlms_xapi_document" (
        "document_kind",
        COALESCE("activity_iri", ''),
        COALESCE("agent_json"::text, ''),
        COALESCE("registration_id"::text, ''),
        COALESCE("state_id", ''),
        COALESCE("profile_id", '')
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rlms_lti_platform_deployment" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "issuer" text NOT NULL,
        "client_id" text NOT NULL,
        "deployment_id" text NOT NULL,
        "auth_login_url" text NOT NULL,
        "auth_token_url" text NOT NULL,
        "jwks_url" text NOT NULL,
        "tool_jwks_json" jsonb,
        "platform_key_id" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by_user_id" uuid,
        "updated_by_user_id" uuid,
        CONSTRAINT "pk_rlms_lti_platform_deployment" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rlms_lti_launch_nonce" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "nonce" text NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_rlms_lti_launch_nonce" PRIMARY KEY ("id"),
        CONSTRAINT "uq_rlms_lti_launch_nonce_nonce" UNIQUE ("nonce")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rlms_event_log" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "person_id" uuid,
        "action" text NOT NULL,
        "subject_type" text,
        "subject_id" uuid,
        "payload_json" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_rlms_event_log" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "rlms_group"
        ADD CONSTRAINT "fk_rlms_group_parent"
        FOREIGN KEY ("parent_group_id") REFERENCES "rlms_group"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_membership"
        ADD CONSTRAINT "fk_rlms_membership_person"
        FOREIGN KEY ("person_id") REFERENCES "rlms_person"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_course_offering"
        ADD CONSTRAINT "fk_rlms_course_offering_template"
        FOREIGN KEY ("course_template_id")
        REFERENCES "rlms_course_template"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_course_category"
        ADD CONSTRAINT "fk_rlms_course_category_parent"
        FOREIGN KEY ("parent_id") REFERENCES "rlms_course_category"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_course_section"
        ADD CONSTRAINT "fk_rlms_course_section_offering"
        FOREIGN KEY ("course_offering_id")
        REFERENCES "rlms_course_offering"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_course_section"
        ADD CONSTRAINT "fk_rlms_course_section_category"
        FOREIGN KEY ("course_category_id")
        REFERENCES "rlms_course_category"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_activity_node"
        ADD CONSTRAINT "fk_rlms_activity_node_package"
        FOREIGN KEY ("content_package_id")
        REFERENCES "rlms_content_package"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_activity_node"
        ADD CONSTRAINT "fk_rlms_activity_node_parent"
        FOREIGN KEY ("parent_id") REFERENCES "rlms_activity_node"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_course_module"
        ADD CONSTRAINT "fk_rlms_course_module_section"
        FOREIGN KEY ("course_section_id")
        REFERENCES "rlms_course_section"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_course_module"
        ADD CONSTRAINT "fk_rlms_course_module_package"
        FOREIGN KEY ("content_package_id")
        REFERENCES "rlms_content_package"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_course_module"
        ADD CONSTRAINT "fk_rlms_course_module_node"
        FOREIGN KEY ("activity_node_id")
        REFERENCES "rlms_activity_node"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_enrolment_method"
        ADD CONSTRAINT "fk_rlms_enrolment_method_section"
        FOREIGN KEY ("course_section_id")
        REFERENCES "rlms_course_section"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_registration"
        ADD CONSTRAINT "fk_rlms_registration_person"
        FOREIGN KEY ("person_id") REFERENCES "rlms_person"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_registration"
        ADD CONSTRAINT "fk_rlms_registration_section"
        FOREIGN KEY ("course_section_id")
        REFERENCES "rlms_course_section"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_registration"
        ADD CONSTRAINT "fk_rlms_registration_enrolment"
        FOREIGN KEY ("enrolment_method_id")
        REFERENCES "rlms_enrolment_method"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_attempt"
        ADD CONSTRAINT "fk_rlms_attempt_registration"
        FOREIGN KEY ("registration_id") REFERENCES "rlms_registration"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_attempt"
        ADD CONSTRAINT "fk_rlms_attempt_module"
        FOREIGN KEY ("course_module_id") REFERENCES "rlms_course_module"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_attempt"
        ADD CONSTRAINT "fk_rlms_attempt_node"
        FOREIGN KEY ("activity_node_id") REFERENCES "rlms_activity_node"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_normalized_progress"
        ADD CONSTRAINT "fk_rlms_normalized_progress_registration"
        FOREIGN KEY ("registration_id") REFERENCES "rlms_registration"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_normalized_progress"
        ADD CONSTRAINT "fk_rlms_normalized_progress_module"
        FOREIGN KEY ("course_module_id") REFERENCES "rlms_course_module"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_normalized_progress"
        ADD CONSTRAINT "fk_rlms_normalized_progress_node"
        FOREIGN KEY ("activity_node_id") REFERENCES "rlms_activity_node"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_line_item"
        ADD CONSTRAINT "fk_rlms_line_item_section"
        FOREIGN KEY ("course_section_id")
        REFERENCES "rlms_course_section"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_line_item"
        ADD CONSTRAINT "fk_rlms_line_item_module"
        FOREIGN KEY ("course_module_id") REFERENCES "rlms_course_module"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_line_item"
        ADD CONSTRAINT "fk_rlms_line_item_node"
        FOREIGN KEY ("activity_node_id") REFERENCES "rlms_activity_node"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_result"
        ADD CONSTRAINT "fk_rlms_result_line_item"
        FOREIGN KEY ("line_item_id") REFERENCES "rlms_line_item"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_result"
        ADD CONSTRAINT "fk_rlms_result_person"
        FOREIGN KEY ("person_id") REFERENCES "rlms_person"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_xapi_statement"
        ADD CONSTRAINT "fk_rlms_xapi_statement_registration"
        FOREIGN KEY ("registration_id") REFERENCES "rlms_registration"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_xapi_statement"
        ADD CONSTRAINT "fk_rlms_xapi_statement_attempt"
        FOREIGN KEY ("attempt_id") REFERENCES "rlms_attempt"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_xapi_document"
        ADD CONSTRAINT "fk_rlms_xapi_document_registration"
        FOREIGN KEY ("registration_id") REFERENCES "rlms_registration"("id")
    `);
    await queryRunner.query(`
      ALTER TABLE "rlms_event_log"
        ADD CONSTRAINT "fk_rlms_event_log_person"
        FOREIGN KEY ("person_id") REFERENCES "rlms_person"("id")
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_rlms_membership_person_id"
      ON "rlms_membership" ("person_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_rlms_course_module_section_id"
      ON "rlms_course_module" ("course_section_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_rlms_course_module_package_id"
      ON "rlms_course_module" ("content_package_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_rlms_registration_section_id"
      ON "rlms_registration" ("course_section_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_rlms_attempt_registration_id"
      ON "rlms_attempt" ("registration_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_rlms_normalized_progress_registration_id"
      ON "rlms_normalized_progress" ("registration_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_rlms_event_log_created_at"
      ON "rlms_event_log" ("created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "rlms_event_log"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rlms_lti_launch_nonce"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "rlms_lti_platform_deployment"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "rlms_xapi_document"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rlms_xapi_statement"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rlms_result"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rlms_line_item"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rlms_normalized_progress"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rlms_attempt"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rlms_registration"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rlms_enrolment_method"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rlms_course_module"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rlms_activity_node"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rlms_content_package"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rlms_course_section"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rlms_course_category"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rlms_course_offering"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rlms_course_template"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rlms_membership"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rlms_group"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rlms_person"`);
  }
}
