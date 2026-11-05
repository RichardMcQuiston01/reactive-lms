/**
 * A person as an admin picker shows them (response shape). It carries only
 * what is needed to tell people apart and pick one.
 */
export interface PersonSummaryDto {
  /** Person id (persistence person row). */
  id: string;
  /** Display name when the host supplied one. */
  displayName?: string;
  /** Email when the host supplied one. */
  email?: string;
  /** Host-side identifier for the person. */
  externalId: string;
}
