import { describe, expect, test } from 'bun:test';
import type { ProgressSinkService } from '@richardmcquiston01/reactive-lms-core';
import type { NormalizedProgress } from '@richardmcquiston01/reactive-lms-shared';
import type { CatalogService } from '../catalog/catalog.service';
import type { LmsRequestService } from '../identity/lms-request.service';
import { ProgressController } from './progress.controller';

describe('ProgressController', () => {
  test('POST upserts through ProgressSinkService', async () => {
    const written: NormalizedProgress[] = [];
    const ctl = new ProgressController(
      {
        upsert: async (progress) => {
          written.push(progress);
        },
      } as ProgressSinkService,
      {
        moduleActivityNodeId: async () => 'node-1',
        listProgress: async () => [],
      } as unknown as CatalogService,
      {
        assertCan: async () => undefined,
      } as LmsRequestService,
    );

    await ctl.upsert(
      'reg-1',
      {
        courseModuleId: 'mod-1',
        completionStatus: 'completed',
      },
      {},
    );

    expect(written).toEqual([
      {
        registrationId: 'reg-1',
        courseModuleId: 'mod-1',
        activityNodeId: 'node-1',
        completionStatus: 'completed',
        successStatus: 'unknown',
        scoreScaled: undefined,
        scoreRaw: undefined,
        scoreMin: undefined,
        scoreMax: undefined,
        progressMeasure: undefined,
        location: undefined,
        totalTime: undefined,
        suspendData: undefined,
      },
    ]);
  });

  test('GET returns catalog progress rows', async () => {
    const rows: NormalizedProgress[] = [
      {
        registrationId: 'reg-1',
        courseModuleId: 'mod-1',
        activityNodeId: 'node-1',
        completionStatus: 'incomplete',
        successStatus: 'unknown',
      },
    ];
    const ctl = new ProgressController(
      { upsert: async () => undefined } as ProgressSinkService,
      {
        listProgress: async () => rows,
      } as unknown as CatalogService,
      { assertCan: async () => undefined } as LmsRequestService,
    );

    expect(await ctl.list('reg-1', {})).toEqual(rows);
  });

  test('POST resolves the package entry node when the module has none', async () => {
    const written: NormalizedProgress[] = [];
    const ctl = new ProgressController(
      {
        upsert: async (progress) => {
          written.push(progress);
        },
      } as ProgressSinkService,
      {
        moduleActivityNodeId: async () => undefined,
        packageEntryActivityNodeId: async () => 'entry-node-1',
      } as unknown as CatalogService,
      { assertCan: async () => undefined } as LmsRequestService,
    );

    await ctl.upsert(
      'reg-1',
      { courseModuleId: 'mod-1', completionStatus: 'completed' },
      {},
    );

    expect(written[0]?.activityNodeId).toBe('entry-node-1');
    expect(written[0]?.completionStatus).toBe('completed');
  });
});
