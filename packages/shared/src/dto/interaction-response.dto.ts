/**
 * One answer a SCO reported through `cmi.interactions.n.*`, for review
 * screens. Values are the text the SCO wrote.
 */
export interface InteractionResponseDto {
  /** Row id. */
  id: string;
  /** Attempt (launch session) that reported it. */
  attemptId: string;
  /** Registration the attempt belongs to. */
  registrationId: string;
  /** Course module that was launched. */
  courseModuleId: string;
  /** Activity node (SCO) that was launched, when known. */
  activityNodeId?: string;
  /** The SCO's own index for the interaction (0-based). */
  interactionIndex: number;
  /** `cmi.interactions.n.id`. */
  interactionId?: string;
  /** `true-false`, `choice`, `fill-in`, `matching`, `performance`, `sequencing`, `likert` or `numeric`. */
  interactionType?: string;
  /** Objective ids the interaction counts toward. */
  objectiveIds: string[];
  /** Accepted answers as the SCO wrote them. */
  correctPatterns: string[];
  /** `HH:MM:SS` the learner answered. */
  timeOfDay?: string;
  /** What the learner answered. */
  studentResponse?: string;
  /** `correct`, `wrong`, `unanticipated`, `neutral`, or a number as text. */
  result?: string;
  /** Weight of the interaction as text. */
  weighting?: string;
  /** `HHHH:MM:SS` taken to answer. */
  latency?: string;
  /** ISO-8601 time the row was stored. */
  createdAt: string;
}
