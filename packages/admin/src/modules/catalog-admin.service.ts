import { Injectable, inject } from '@angular/core';
import type {
  ContentPackageDto,
  CourseSectionDto,
  ImportPackageResultDto,
} from '@richardmcquiston01/reactive-lms-shared';
import { ADMIN_API_CLIENT } from '../api/admin-api-client.token';
import { firstPage, pageQuery, type PageRequest } from './paging';

/**
 * Read calls for the lists the admin screens pick from. Every method goes
 * through the injected {@link ADMIN_API_CLIENT}, so a host's wrapper applies.
 * Lists are paged: pass the next page's offset to read past the first.
 */
@Injectable({ providedIn: 'root' })
export class CatalogAdminService {
  private readonly client = inject(ADMIN_API_CLIENT);

  /**
   * Lists course sections by title.
   *
   * @param page - Rows to ask for and to skip; the first page by default
   * @param courseOfferingId - Only sections of this offering
   */
  listSections(
    page: PageRequest = firstPage(),
    courseOfferingId?: string,
  ): Promise<CourseSectionDto[]> {
    return this.client.request<CourseSectionDto[]>(
      `/course-sections${pageQuery(page, { courseOfferingId })}`,
    );
  }

  /**
   * Uploads a package archive for import. The body is multipart, so the HTTP
   * client leaves the content type to the browser.
   *
   * @param file - ZIP archive chosen by the administrator
   */
  importPackage(file: File): Promise<ImportPackageResultDto> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.client.request<ImportPackageResultDto>('/packages', {
      method: 'POST',
      body: form,
    });
  }

  /**
   * Lists imported content packages, newest first.
   *
   * @param page - Rows to ask for and to skip; the first page by default
   */
  listPackages(page: PageRequest = firstPage()): Promise<ContentPackageDto[]> {
    return this.client.request<ContentPackageDto[]>(
      `/packages${pageQuery(page)}`,
    );
  }
}
