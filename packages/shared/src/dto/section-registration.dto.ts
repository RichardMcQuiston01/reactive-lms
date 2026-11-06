import type { RegistrationStatus } from '../enums/registration-status';

/**
 * One row of a section's roster: a registration with the enrolled person's
 * display details, for admin enrolment and progress screens.
 */
export interface SectionRegistrationDto {
  /** Registration id. */
  id: string;
  /** Person id (persistence person row). */
  personId: string;
  /** Person's display name when the host supplied one. */
  displayName?: string;
  /** Person's email when the host supplied one. */
  email?: string;
  /** Host-side identifier for the person. */
  externalId?: string;
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
