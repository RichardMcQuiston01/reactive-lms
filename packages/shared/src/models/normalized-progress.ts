/**
 * Completion status for a registration × module × activity node.
 */
export type CompletionStatus =
  | 'unknown'
  | 'not_attempted'
  | 'incomplete'
  | 'completed';

/**
 * Success (pass/fail) status for a registration × module × activity node.
 */
export type SuccessStatus = 'unknown' | 'passed' | 'failed';

/**
 * Format-agnostic progress written by every {@link ContentRuntime} via ProgressSink.
 * SCORM CMI, cmi5 statements, H5P xAPI, HTML5 postMessage, and LTI AGS map here.
 */
export interface NormalizedProgress {
  /** Registration receiving the update. */
  registrationId: string;
  /** Course module (placement) the progress applies to. */
  courseModuleId: string;
  /** Activity node (SCO / AU / item) within the package. */
  activityNodeId: string;
  /** Whether the activity is complete. */
  completionStatus: CompletionStatus;
  /** Whether the learner passed when the format reports success. */
  successStatus: SuccessStatus;
  /** Score scaled to 0..1 when known. */
  scoreScaled?: number;
  /** Raw score as reported by the content. */
  scoreRaw?: number;
  /** Minimum raw score scale. */
  scoreMin?: number;
  /** Maximum raw score scale. */
  scoreMax?: number;
  /** Progress measure 0..1 when known. */
  progressMeasure?: number;
  /** Bookmark / location string (e.g. SCORM location). */
  location?: string;
  /** Accumulated time as an ISO-8601 duration when known. */
  totalTime?: string;
  /** Opaque suspend data for resume. */
  suspendData?: string;
}
