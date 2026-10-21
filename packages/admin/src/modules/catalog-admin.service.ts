import { Injectable, inject } from '@angular/core';
import type {
  ContentPackageDto,
  CourseSectionDto,
} from '@richardmcquiston01/reactive-lms-shared';
import { ADMIN_API_CLIENT } from '../api/admin-api-client.token';

/**
 * Read calls for the lists the admin screens pick from. Every method goes
 * through the injected {@link ADMIN_API_CLIENT}, so a host's wrapper applies.
 * The API returns up to 200 rows by default (500 at most).
 */
@Injectable({ providedIn: 'root' })
export class CatalogAdminService {
  private readonly client = inject(ADMIN_API_CLIENT);

  /**
   * Lists course sections by title.
   *
   * @param courseOfferingId - Only sections of this offering
   */
  listSections(courseOfferingId?: string): Promise<CourseSectionDto[]> {
    const query = courseOfferingId
      ? `?courseOfferingId=${encodeURIComponent(courseOfferingId)}`
      : '';
    return this.client.request<CourseSectionDto[]>(`/course-sections${query}`);
  }

  /** Lists imported content packages, newest first. */
  listPackages(): Promise<ContentPackageDto[]> {
    return this.client.request<ContentPackageDto[]>('/packages');
  }
}
