import { describe, expect, test } from 'bun:test';
import type { EnrolmentService } from '@reactive-lms/core';
import type { ModuleService } from '@reactive-lms/core';
import type { CatalogService } from '../catalog/catalog.service';
import type { LmsRequestService } from '../identity/lms-request.service';
import { CoursesController } from './courses.controller';
import { EnrolmentsController } from './enrolments.controller';
import { ModulesController } from './modules.controller';

const request = {
  assertCan: async () => undefined,
  ensurePersonId: async () => 'actor-1',
} as LmsRequestService;

describe('CoursesController', () => {
  test('creates template, offering, and section via catalog', async () => {
    const calls: string[] = [];
    const catalog = {
      createTemplate: async () => {
        calls.push('template');
        return { id: 'tpl-1' };
      },
      createOffering: async () => {
        calls.push('offering');
        return { id: 'off-1' };
      },
      createSection: async () => {
        calls.push('section');
        return { id: 'sec-1' };
      },
    } as unknown as CatalogService;
    const ctl = new CoursesController(catalog, request);

    expect(await ctl.createTemplate({ title: 'T' }, {})).toEqual({
      id: 'tpl-1',
    });
    expect(
      await ctl.createOffering({ courseTemplateId: 'tpl-1', title: 'O' }, {}),
    ).toEqual({ id: 'off-1' });
    expect(
      await ctl.createSection({ courseOfferingId: 'off-1', title: 'S' }, {}),
    ).toEqual({ id: 'sec-1' });
    expect(calls).toEqual(['template', 'offering', 'section']);
  });
});

describe('ModulesController', () => {
  test('place delegates to ModuleService', async () => {
    const placed: unknown[] = [];
    const ctl = new ModulesController(
      {
        place: async (sectionId, input) => {
          placed.push({ sectionId, input });
          return { moduleId: 'mod-1' };
        },
      } as unknown as ModuleService,
      {} as CatalogService,
      request,
    );

    const result = await ctl.place('sec-1', { contentPackageId: 'pkg-1' }, {});
    expect(result).toEqual({ moduleId: 'mod-1' });
    expect(placed).toEqual([
      { sectionId: 'sec-1', input: { contentPackageId: 'pkg-1' } },
    ]);
  });
});

describe('EnrolmentsController', () => {
  test('self-enrol uses the current person id', async () => {
    const calls: unknown[] = [];
    const ctl = new EnrolmentsController(
      {
        self: async (sectionId, personId, options) => {
          calls.push({ sectionId, personId, options });
          return { registrationId: 'reg-1' };
        },
      } as unknown as EnrolmentService,
      {} as CatalogService,
      request,
    );

    expect(await ctl.selfEnrol('sec-1', { key: 'abc' }, {})).toEqual({
      registrationId: 'reg-1',
    });
    expect(calls).toEqual([
      { sectionId: 'sec-1', personId: 'actor-1', options: { key: 'abc' } },
    ]);
  });

  test('memberships default to EnrolmentService.manual', async () => {
    const calls: unknown[] = [];
    const ctl = new EnrolmentsController(
      {
        manual: async (sectionId, personId, actorPersonId) => {
          calls.push({ sectionId, personId, actorPersonId });
          return { registrationId: 'reg-2' };
        },
      } as unknown as EnrolmentService,
      {} as CatalogService,
      request,
    );

    expect(
      await ctl.createMembership('sec-1', { personId: 'learner-1' }, {}),
    ).toEqual({ registrationId: 'reg-2' });
    expect(calls).toEqual([
      {
        sectionId: 'sec-1',
        personId: 'learner-1',
        actorPersonId: 'actor-1',
      },
    ]);
  });
});
