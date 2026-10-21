/**
 * Optional host SIS bridge for section membership sync.
 * Omit or leave unimplemented when ReactiveLMS owns enrolment itself.
 */
export interface EnrolmentAdapter {
  /**
   * Host SIS may create, update, or deactivate memberships for a section.
   *
   * @param sectionId - Course section to sync
   */
  syncSection?(sectionId: string): Promise<void>;
}
