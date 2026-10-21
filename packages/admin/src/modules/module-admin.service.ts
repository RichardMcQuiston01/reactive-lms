import { Injectable, inject } from '@angular/core';
import type { CourseModuleDto } from '@richardmcquiston01/reactive-lms-shared';
import { ADMIN_API_CLIENT } from '../api/admin-api-client.token';
import type { SortOrderPatch } from './module-tree';

/**
 * Module and block calls used by the module-tree screen. Every method goes
 * through the injected {@link ADMIN_API_CLIENT}, so a host's wrapper applies.
 */
@Injectable({ providedIn: 'root' })
export class ModuleAdminService {
  private readonly client = inject(ADMIN_API_CLIENT);

  /**
   * Loads a section's modules and blocks.
   *
   * @param sectionId - Course section id
   */
  list(sectionId: string): Promise<CourseModuleDto[]> {
    return this.client.request<CourseModuleDto[]>(
      `/course-sections/${encodeURIComponent(sectionId)}/modules`,
    );
  }

  /**
   * Adds a block (chapter).
   *
   * @param sectionId - Course section id
   * @param title - Block title
   * @param parentModuleId - Parent block, or `null` for the top level
   */
  addBlock(
    sectionId: string,
    title: string,
    parentModuleId: string | null,
  ): Promise<{ moduleId: string }> {
    return this.client.request<{ moduleId: string }>(
      `/course-sections/${encodeURIComponent(sectionId)}/blocks`,
      {
        method: 'POST',
        body: JSON.stringify({
          title,
          ...(parentModuleId === null ? {} : { parentModuleId }),
        }),
      },
    );
  }

  /**
   * Renames a module or block.
   *
   * @param moduleId - Course module id
   * @param title - New title
   */
  rename(moduleId: string, title: string): Promise<{ id: string }> {
    return this.patch(moduleId, { title });
  }

  /**
   * Moves a module into a block, or to the top level with `null`. It lands
   * after the new siblings.
   *
   * @param moduleId - Course module id
   * @param parentModuleId - New parent block, or `null`
   */
  moveTo(
    moduleId: string,
    parentModuleId: string | null,
  ): Promise<{ id: string }> {
    return this.patch(moduleId, { parentModuleId });
  }

  /**
   * Applies sort-order patches one after another so a failure stops the rest.
   *
   * @param patches - Rows to renumber
   */
  async reorder(patches: readonly SortOrderPatch[]): Promise<void> {
    for (const patch of patches) {
      await this.patch(patch.id, { sortOrder: patch.sortOrder });
    }
  }

  /**
   * Removes a module or an empty block. The package stays.
   *
   * @param moduleId - Course module id
   */
  async remove(moduleId: string): Promise<void> {
    await this.client.request<void>(
      `/course-modules/${encodeURIComponent(moduleId)}`,
      { method: 'DELETE' },
    );
  }

  private patch(
    moduleId: string,
    body: Record<string, unknown>,
  ): Promise<{ id: string }> {
    return this.client.request<{ id: string }>(
      `/course-modules/${encodeURIComponent(moduleId)}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
  }
}
