import { Injectable, inject } from '@angular/core';
import type { SectionRegistrationDto } from '@richardmcquiston01/reactive-lms-shared';
import { ADMIN_API_CLIENT } from '../api/admin-api-client.token';
import { firstPage, pageQuery, type PageRequest } from './paging';

/** How an administrator adds a person to a section. */
export type EnrolMethod = 'manual' | 'group';

/**
 * Roster calls used by the enrolment and progress screens. Every method goes
 * through the injected {@link ADMIN_API_CLIENT}, so a host's wrapper applies.
 */
@Injectable({ providedIn: 'root' })
export class RosterAdminService {
  private readonly client = inject(ADMIN_API_CLIENT);

  /**
   * Lists the people registered on a section, oldest registration first.
   *
   * @param sectionId - Course section id
   * @param page - Rows to ask for and to skip; the first page by default
   */
  listRoster(
    sectionId: string,
    page: PageRequest = firstPage(),
  ): Promise<SectionRegistrationDto[]> {
    return this.client.request<SectionRegistrationDto[]>(
      `/course-sections/${encodeURIComponent(sectionId)}/registrations${pageQuery(page)}`,
    );
  }

  /**
   * Enrols a person on a section.
   *
   * @param sectionId - Course section id
   * @param personId - Person to enrol
   * @param method - `manual` (default) or `group`
   */
  enrol(
    sectionId: string,
    personId: string,
    method: EnrolMethod = 'manual',
  ): Promise<{ registrationId: string }> {
    return this.client.request<{ registrationId: string }>(
      `/course-sections/${encodeURIComponent(sectionId)}/memberships`,
      { method: 'POST', body: JSON.stringify({ personId, method }) },
    );
  }
}
