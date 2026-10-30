import { describe, expect, test } from 'bun:test';
import type {
  LaunchProgressInput,
  ProgressSinkService,
} from '@richardmcquiston01/reactive-lms-core';
import type { NormalizedProgress } from '@richardmcquiston01/reactive-lms-shared';
import type { CatalogService } from '../catalog/catalog.service';
import type { LmsRequestService } from '../identity/lms-request.service';
import { ProgressController } from './progress.controller';

describe('ProgressController', () => {
  test('POST hands content-reported progress to the launch-checked sink', async () => {
    const written: LaunchProgressInput[] = [];
    const checks: string[] = [];
    const ctl = new ProgressController(
      {
        upsertFromLaunch: async (progress) => {
          written.push(progress);
        },
      } as ProgressSinkService,
      { listProgress: async () => [] } as unknown as CatalogService,
      {
        assertCan: async (_req, action, resource) => {
          checks.push(`${action}:${resource.type}:${resource.id}`);
        },
      } as LmsRequestService,
    );

    await ctl.upsert(
      'reg-1',
      { courseModuleId: 'mod-1', completionStatus: 'completed' },
      {},
    );

    expect(checks).toEqual(['launch:registration:reg-1']);
    expect(written).toEqual([
      {
        registrationId: 'reg-1',
        courseModuleId: 'mod-1',
        activityNodeId: undefined,
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

  test('POST passes a supplied node through so the sink can reject a mismatch', async () => {
    const written: LaunchProgressInput[] = [];
    const ctl = new ProgressController(
      {
        upsertFromLaunch: async (progress) => {
          written.push(progress);
        },
      } as ProgressSinkService,
      {} as CatalogService,
      { assertCan: async () => undefined } as LmsRequestService,
    );

    await ctl.upsert(
      'reg-1',
      { courseModuleId: 'mod-1', activityNodeId: 'node-9' },
      {},
    );

    expect(written[0]?.activityNodeId).toBe('node-9');
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
      {} as ProgressSinkService,
      { listProgress: async () => rows } as unknown as CatalogService,
      { assertCan: async () => undefined } as LmsRequestService,
    );

    expect(await ctl.list('reg-1', {})).toEqual(rows);
  });
});
