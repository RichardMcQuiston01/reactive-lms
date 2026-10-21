/**
 * Rolled-up registration (enrolment) status for a person on a course section.
 * Values match `registration.status` persistence.
 */
export type RegistrationStatus =
  'not_started' | 'in_progress' | 'completed' | 'passed' | 'failed' | 'waived';
