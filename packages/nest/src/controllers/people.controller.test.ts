import { describe, expect, test } from 'bun:test';
import type { LmsRequestService } from '../identity/lms-request.service';
import {
  escapeLikePattern,
  type PersonDirectory,
} from '../identity/person-directory';
import { PeopleController } from './people.controller';

describe('PeopleController', () => {
  test('searches after checking enrol.manage and passes the paging on', async () => {
    const checks: unknown[] = [];
    const searches: unknown[] = [];
    const ctl = new PeopleController(
      {
        search: async (search: string, page: unknown) => {
          searches.push({ search, page });
          return [{ id: 'p1', externalId: 'e1' }];
        },
      } as unknown as PersonDirectory,
      {
        assertCan: async (
          _req: unknown,
          capability: string,
          scope: unknown,
        ) => {
          checks.push({ capability, scope });
        },
      } as unknown as LmsRequestService,
    );

    expect(await ctl.search({}, 'ada', '25', '50')).toEqual([
      { id: 'p1', externalId: 'e1' },
    ]);
    expect(checks).toEqual([
      { capability: 'enrol.manage', scope: { type: 'person', id: '*' } },
    ]);
    expect(searches).toEqual([
      { search: 'ada', page: { limit: 25, offset: 50 } },
    ]);
  });

  test('a missing search lists everyone', async () => {
    const searches: unknown[] = [];
    const ctl = new PeopleController(
      {
        search: async (search: string) => {
          searches.push(search);
          return [];
        },
      } as unknown as PersonDirectory,
      { assertCan: async () => undefined } as unknown as LmsRequestService,
    );

    await ctl.search({});

    expect(searches).toEqual(['']);
  });

  test('a denied capability stops the search', async () => {
    const searches: string[] = [];
    const ctl = new PeopleController(
      {
        search: async () => {
          searches.push('searched');
          return [];
        },
      } as unknown as PersonDirectory,
      {
        assertCan: async () => {
          throw new Error('Not allowed to manage enrolment.');
        },
      } as unknown as LmsRequestService,
    );

    await expect(ctl.search({}, 'ada')).rejects.toThrow(
      'Not allowed to manage enrolment.',
    );
    expect(searches).toEqual([]);
  });
});

describe('escapeLikePattern', () => {
  test('escapes the wildcard and escape characters', () => {
    expect(escapeLikePattern('100%_\\')).toBe('100\\%\\_\\\\');
  });

  test('leaves ordinary text alone', () => {
    expect(escapeLikePattern('Ada Lovelace')).toBe('Ada Lovelace');
  });
});
