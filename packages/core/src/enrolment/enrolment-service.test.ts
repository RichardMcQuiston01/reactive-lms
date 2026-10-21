import { describe, expect, test } from 'bun:test';
import {
  EnrolmentMethod,
  EventLog,
  Membership,
  Registration,
} from '@reactive-lms/persistence';
import { LmsError } from '@reactive-lms/shared';
import type { DataSource } from 'typeorm';
import { EventLogService } from '../audit/event-log.service';
import { EnrolmentService } from './enrolment-service';
import { createMockDataSource } from '../test/mock-data-source';

const SECTION_ID = '33333333-3333-4333-8333-333333333333';
const PERSON_ID = '44444444-4444-4444-8444-444444444444';
const ACTOR_ID = '55555555-5555-4555-8555-555555555555';
const GROUP_ID = '66666666-6666-4666-8666-666666666666';
const OTHER_GROUP = '77777777-7777-4777-8777-777777777777';

function serviceOf(ds: ReturnType<typeof createMockDataSource>): EnrolmentService {
  return new EnrolmentService(
    ds as unknown as DataSource,
    new EventLogService(ds as unknown as DataSource),
  );
}

describe('EnrolmentService', () => {
  test('manual creates an enabled method when none exists and enrols', async () => {
    const ds = createMockDataSource();
    const result = await serviceOf(ds).manual(SECTION_ID, PERSON_ID, ACTOR_ID);

    expect(result.registrationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const methods = ds.rowsOf(EnrolmentMethod);
    expect(methods).toHaveLength(1);
    expect(methods[0]).toMatchObject({
      courseSectionId: SECTION_ID,
      method: 'manual',
      isEnabled: true,
    });

    const memberships = ds.rowsOf(Membership);
    expect(memberships).toEqual([
      expect.objectContaining({
        personId: PERSON_ID,
        collectionType: 'course_section',
        collectionId: SECTION_ID,
        role: 'learner',
      }),
    ]);

    const registrations = ds.rowsOf(Registration);
    expect(registrations).toEqual([
      expect.objectContaining({
        id: result.registrationId,
        personId: PERSON_ID,
        courseSectionId: SECTION_ID,
        status: 'not_started',
        enrolmentMethodId: methods[0]?.id,
      }),
    ]);

    expect(ds.rowsOf(EventLog)).toEqual([
      expect.objectContaining({
        personId: PERSON_ID,
        action: 'enrol.joined',
        subjectType: 'registration',
        subjectId: result.registrationId,
      }),
    ]);
  });

  test('manual returns the existing registration on repeat enrol', async () => {
    const ds = createMockDataSource();
    const enrol = serviceOf(ds);
    const first = await enrol.manual(SECTION_ID, PERSON_ID, ACTOR_ID);
    const second = await enrol.manual(SECTION_ID, PERSON_ID, ACTOR_ID);

    expect(second.registrationId).toBe(first.registrationId);
    expect(ds.rowsOf(Registration)).toHaveLength(1);
    expect(ds.rowsOf(Membership)).toHaveLength(1);
    expect(ds.rowsOf(EventLog)).toHaveLength(1);
  });

  test('self requires an enabled self method', async () => {
    const ds = createMockDataSource();
    try {
      await serviceOf(ds).self(SECTION_ID, PERSON_ID);
      throw new Error('expected self to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: 'ENROLMENT_METHOD_UNAVAILABLE',
        status: 403,
      });
    }
  });

  test('self enrols when the method is open', async () => {
    const ds = createMockDataSource();
    ds.seed(EnrolmentMethod, {
      id: '88888888-8888-4888-8888-888888888888',
      courseSectionId: SECTION_ID,
      method: 'self',
      isEnabled: true,
      configJson: {
        openFrom: '2020-01-01T00:00:00.000Z',
        openUntil: '2099-01-01T00:00:00.000Z',
      },
    });

    const result = await serviceOf(ds).self(SECTION_ID, PERSON_ID);
    expect(ds.rowsOf(Registration)[0]).toMatchObject({
      id: result.registrationId,
      enrolmentMethodId: '88888888-8888-4888-8888-888888888888',
    });
  });

  test('self rejects when now is outside openFrom / openUntil', async () => {
    const ds = createMockDataSource();
    ds.seed(EnrolmentMethod, {
      courseSectionId: SECTION_ID,
      method: 'self',
      isEnabled: true,
      configJson: {
        openFrom: '2020-01-01T00:00:00.000Z',
        openUntil: '2020-12-31T00:00:00.000Z',
      },
    });

    try {
      await serviceOf(ds).self(SECTION_ID, PERSON_ID);
      throw new Error('expected self to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: 'ENROLMENT_WINDOW_CLOSED',
        status: 403,
      });
    }
  });

  test('self rejects when requiresKey is set and the key does not match', async () => {
    const ds = createMockDataSource();
    ds.seed(EnrolmentMethod, {
      courseSectionId: SECTION_ID,
      method: 'self',
      isEnabled: true,
      configJson: { requiresKey: 'secret-key' },
    });

    try {
      await serviceOf(ds).self(SECTION_ID, PERSON_ID);
      throw new Error('expected self to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: 'ENROLMENT_KEY_REQUIRED',
        status: 403,
      });
    }

    const result = await serviceOf(ds).self(SECTION_ID, PERSON_ID, {
      key: 'secret-key',
    });
    expect(result.registrationId).toBeDefined();
  });

  test('group requires membership in config_json.groupId', async () => {
    const ds = createMockDataSource();
    ds.seed(EnrolmentMethod, {
      courseSectionId: SECTION_ID,
      method: 'group',
      isEnabled: true,
      configJson: { groupId: GROUP_ID },
    });
    ds.seed(Membership, {
      personId: PERSON_ID,
      collectionType: 'group',
      collectionId: OTHER_GROUP,
      role: 'learner',
    });

    try {
      await serviceOf(ds).group(SECTION_ID, PERSON_ID);
      throw new Error('expected group to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: 'ENROLMENT_GROUP_REQUIRED',
        status: 403,
      });
    }
  });

  test('group enrols when the person is in the configured group', async () => {
    const ds = createMockDataSource();
    ds.seed(EnrolmentMethod, {
      id: '99999999-9999-4999-8999-999999999999',
      courseSectionId: SECTION_ID,
      method: 'group',
      isEnabled: true,
      configJson: { groupId: GROUP_ID },
    });
    ds.seed(Membership, {
      personId: PERSON_ID,
      collectionType: 'group',
      collectionId: GROUP_ID,
      role: 'learner',
    });

    const result = await serviceOf(ds).group(SECTION_ID, PERSON_ID);
    expect(ds.rowsOf(Registration)).toEqual([
      expect.objectContaining({
        id: result.registrationId,
        personId: PERSON_ID,
        courseSectionId: SECTION_ID,
        enrolmentMethodId: '99999999-9999-4999-8999-999999999999',
      }),
    ]);
    const sectionMemberships = ds
      .rowsOf(Membership)
      .filter((row) => row.collectionType === 'course_section');
    expect(sectionMemberships).toHaveLength(1);
  });
});
