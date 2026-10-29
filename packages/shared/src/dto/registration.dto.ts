import type { RegistrationStatus } from '../enums/registration-status';

/**
 * API DTO for a person enrolled on a course section (response shape).
 */
export interface RegistrationDto {
  /** Registration id. */
  id: string;
  /** Person id (persistence person row). */
  personId: string;
  /** Course section id. */
  courseSectionId: string;
  /** Enrolment method that created this registration, when known. */
  enrolmentMethodId?: string;
  /** Rolled-up section status. */
  status: RegistrationStatus;
  /** Aggregated scaled score 0..1 when known. */
  scoreScaled?: number;
  /** Total duration as ISO-8601 duration when known. */
  durationIso8601?: string;
  /** ISO-8601 created timestamp. */
  createdAt: string;
  /** ISO-8601 updated timestamp. */
  updatedAt: string;
}
