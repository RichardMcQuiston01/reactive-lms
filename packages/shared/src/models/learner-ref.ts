/**
 * Host-agnostic reference to a learner (person) used at launch and capability checks.
 * Maps to xAPI Agent fields when homepage/name/email are present.
 */
export interface LearnerRef {
  /** Stable id from the host identity system. */
  externalId: string;
  /** Display name shown in UI and gradebook. */
  displayName: string;
  /** xAPI Agent `account.homePage` when using account-based actors. */
  accountHomepage?: string;
  /** xAPI Agent `account.name` (defaults to `externalId` at runtime when omitted). */
  accountName?: string;
  /** Optional mailto identity for xAPI / LTI. */
  email?: string;
}
