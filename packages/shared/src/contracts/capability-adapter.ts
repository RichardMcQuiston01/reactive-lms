import type { LearnerRef } from '../models/learner-ref';

/**
 * Authorization actions checked through the host capability adapter.
 */
export type LmsAction =
  | 'package.import'
  | 'package.delete'
  | 'section.manage'
  | 'module.manage'
  | 'enrol.manage'
  | 'launch'
  | 'grade.view'
  | 'grade.override'
  | 'report.view'
  | 'lti.manage';

/**
 * Actions that change the catalogue, people, or settings, or read other
 * people's results. Without a {@link CapabilityAdapter} these are refused
 * unless the host opts in to unrestricted admin access. `launch` and
 * `grade.view` are learner actions and are not listed.
 */
export const ADMIN_LMS_ACTIONS: readonly LmsAction[] = [
  'package.import',
  'package.delete',
  'section.manage',
  'module.manage',
  'enrol.manage',
  'grade.override',
  'report.view',
  'lti.manage',
];

/**
 * True when `action` is an administrative action.
 *
 * @param action - LMS action code
 */
export function isAdminAction(action: LmsAction): boolean {
  return ADMIN_LMS_ACTIONS.includes(action);
}

/**
 * Resource reference for a capability check (type + id only).
 */
export interface LmsResourceRef {
  /** Resource kind (e.g. `course_section`, `content_package`). */
  type: string;
  /** Resource id. */
  id: string;
}

/**
 * Host-supplied authorization. ReactiveLMS asks; the host decides.
 */
export interface CapabilityAdapter {
  /**
   * Returns whether the learner may perform `action` on `resource`.
   *
   * @param learner - Resolved learner
   * @param action - LMS action code
   * @param resource - Target resource type and id
   */
  can(
    learner: LearnerRef,
    action: LmsAction,
    resource: LmsResourceRef,
  ): Promise<boolean>;
}
