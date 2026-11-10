/**
 * Result codes of the AICC HTTP-based AICC Communication Protocol (HACP).
 * The protocol reports every outcome in the body of an HTTP 200 reply.
 */
export const AICC_ERROR = {
  /** The request was carried out. */
  successful: 0,
  /** The command is unknown, or its data is missing or not valid. */
  invalidCommand: 1,
  /** The assignable unit password is wrong. */
  invalidPassword: 2,
  /** The session id is unknown, has ended, or is not an AICC session. */
  invalidSession: 3,
} as const;

/** A HACP result code. */
export type AiccErrorCode = (typeof AICC_ERROR)[keyof typeof AICC_ERROR];

/**
 * Form fields of a HACP request (`application/x-www-form-urlencoded`).
 * Field names are matched without regard to case.
 */
export interface HacpRequestDto {
  /** `GetParam`, `PutParam`, `ExitAU`, or one of the ignored `Put*` commands. */
  command: string;
  /** HACP version the content speaks, such as `3.5`. */
  version?: string;
  /** The `AICC_SID` the LMS gave the content at launch. */
  session_id: string;
  /** Assignable unit password. Not used: units have none. */
  au_password?: string;
  /** INI-style data for `PutParam` and the other `Put*` commands. */
  aicc_data?: string;
}

/**
 * Parts of a HACP reply. They are sent as plain text: `error=`,
 * `error_text=`, `version=`, and `aicc_data=` followed by the data.
 */
export interface HacpResponseDto {
  /** Result code; 0 means success. */
  errorCode: AiccErrorCode;
  /** Words for the result, with the reason when the request was refused. */
  errorText: string;
  /** HACP version of the reply. */
  version: string;
  /** INI-style data; empty except for a successful `GetParam`. */
  aiccData: string;
}
