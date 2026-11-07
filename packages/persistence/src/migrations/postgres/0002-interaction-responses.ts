import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `rlms_interaction_response`: the answers a SCO reports through
 * `cmi.interactions.n.*`, one row per interaction per attempt.
 */
export class InteractionResponses0002 implements MigrationInterface {
  name = 'InteractionResponses1760000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "rlms_interaction_response" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "attempt_id" uuid NOT NULL,
        "registration_id" uuid NOT NULL,
        "course_module_id" uuid NOT NULL,
        "activity_node_id" uuid,
        "interaction_index" integer NOT NULL,
        "interaction_id" text,
        "interaction_type" text,
        "objective_ids" jsonb NOT NULL DEFAULT '[]',
        "correct_patterns" jsonb NOT NULL DEFAULT '[]',
        "time_of_day" text,
        "student_response" text,
        "result" text,
        "weighting" text,
        "latency" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_rlms_interaction_response" PRIMARY KEY ("id"),
        CONSTRAINT "uq_rlms_interaction_response_slot" UNIQUE ("attempt_id", "interaction_index")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_rlms_interaction_response_registration" ON "rlms_interaction_response" ("registration_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_rlms_interaction_response_attempt" ON "rlms_interaction_response" ("attempt_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "rlms_interaction_response"`);
  }
}
