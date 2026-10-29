/**
 * Request/response body for `GET`/`PUT /scorm/attempts/:id/cmi`.
 */
export interface ScormCmiDto {
  /** Flat SCORM 1.2 CMI element map (`cmi.core.lesson_status`, …). */
  values: Record<string, string>;
  /** When true on PUT, the attempt is finished (`LMSFinish`). */
  finished?: boolean;
}
