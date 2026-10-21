/**
 * API DTO for an enrollable course section (response shape).
 */
export interface CourseSectionDto {
  /** Section id. */
  id: string;
  /** Offering the section belongs to. */
  courseOfferingId: string;
  /** Display title. */
  title: string;
  /** ISO-8601 created timestamp. */
  createdAt: string;
  /** ISO-8601 updated timestamp. */
  updatedAt: string;
}
