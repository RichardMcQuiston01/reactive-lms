import { describe, expect, test } from 'bun:test';
import {
  MAX_AVAILABILITY_DEPTH,
  MAX_AVAILABILITY_NODES,
  parseAvailability,
  referencedGroupIds,
  type AvailabilityV1,
} from './availability';

function errorsOf(value: unknown): string[] {
  const result = parseAvailability(value);
  if (result.ok) {
    throw new Error('Expected validation to fail.');
  }
  return result.errors;
}

function valueOf(value: unknown): AvailabilityV1 | null {
  const result = parseAvailability(value);
  if (!result.ok) {
    throw new Error(`Expected success: ${result.errors.join('; ')}`);
  }
  return result.value;
}

describe('parseAvailability: no rules', () => {
  test('null, undefined, an empty object, and an empty all mean no rules', () => {
    expect(valueOf(null)).toBeNull();
    expect(valueOf(undefined)).toBeNull();
    expect(valueOf({})).toBeNull();
    expect(valueOf({ version: 1, all: [] })).toBeNull();
  });

  test('rejects values that are not objects', () => {
    expect(errorsOf('x')[0]).toContain('must be an object');
    expect(errorsOf([])[0]).toContain('must be an object');
  });
});

describe('parseAvailability: version 0 upcast', () => {
  test('maps every legacy field onto conditions', () => {
    expect(
      valueOf({
        afterModuleId: 'm1',
        availableFrom: '2026-06-01T00:00:00.000Z',
        availableUntil: '2026-06-30T00:00:00.000Z',
        minScore: 0.8,
      }),
    ).toEqual({
      version: 1,
      all: [
        {
          type: 'date_window',
          from: '2026-06-01T00:00:00.000Z',
          until: '2026-06-30T00:00:00.000Z',
        },
        { type: 'module_completed', moduleId: 'm1' },
        { type: 'min_score', moduleId: 'm1', score: 0.8 },
      ],
    });
  });

  test('a legacy minScore without afterModuleId applies to the module itself', () => {
    expect(valueOf({ minScore: 0.5 })).toEqual({
      version: 1,
      all: [{ type: 'min_score', score: 0.5 }],
    });
  });

  test('reports unknown fields and bad values together', () => {
    const errors = errorsOf({
      afterModuleId: '',
      availableFrom: 'not a date',
      minScore: 2,
      bogus: true,
    });
    expect(errors).toHaveLength(4);
    expect(errors.join('\n')).toContain('Unknown availability field "bogus"');
    expect(errors.join('\n')).toContain('availableFrom must be an ISO 8601');
    expect(errors.join('\n')).toContain('afterModuleId must be a non-empty');
    expect(errors.join('\n')).toContain(
      'minScore must be a number from 0 to 1',
    );
  });
});

describe('parseAvailability: version 1', () => {
  test('accepts every condition type inside all', () => {
    const rules: AvailabilityV1 = {
      version: 1,
      all: [
        { type: 'module_completed', moduleId: 'm1' },
        { type: 'date_window', from: '2026-01-01T00:00:00.000Z' },
        { type: 'min_score', score: 0.7 },
        { type: 'group_member', groupId: 'g1' },
      ],
    };
    expect(valueOf(rules)).toEqual(rules);
  });

  test('accepts any and nested groups', () => {
    const rules: AvailabilityV1 = {
      version: 1,
      any: [
        { type: 'group_member', groupId: 'g1' },
        { all: [{ type: 'module_completed', moduleId: 'm1' }] },
      ],
    };
    expect(valueOf(rules)).toEqual(rules);
  });

  test('rejects an unknown version, naming it', () => {
    expect(errorsOf({ version: 2, all: [] })[0]).toContain(
      'Unsupported availability version 2',
    );
    expect(errorsOf({ version: '1', all: [] })[0]).toContain('version "1"');
  });

  test('a group needs exactly one of all or any', () => {
    expect(errorsOf({ version: 1 })[0]).toContain(
      'exactly one of "all" or "any"',
    );
    expect(errorsOf({ version: 1, all: [], any: [] })[0]).toContain(
      'exactly one',
    );
  });

  test('an empty any is rejected because it can never be satisfied', () => {
    expect(errorsOf({ version: 1, any: [] })[0]).toContain('at least one');
  });

  test('errors carry the path of the offending node', () => {
    const errors = errorsOf({
      version: 1,
      all: [
        { type: 'module_completed', moduleId: 'm1' },
        { any: [{ type: 'group_member', groupId: '' }] },
      ],
    });
    expect(errors).toEqual([
      'availability.all[1].any[0].groupId must be a non-empty string.',
    ]);
  });

  test('rejects an unknown condition type, listing the valid ones', () => {
    const [message] = errorsOf({ version: 1, all: [{ type: 'weather' }] });
    expect(message).toContain('availability.all[0].type must be one of');
    expect(message).toContain('"weather"');
  });

  test('validates date windows', () => {
    expect(
      errorsOf({ version: 1, all: [{ type: 'date_window' }] })[0],
    ).toContain('needs "from" or "until"');
    expect(
      errorsOf({
        version: 1,
        all: [
          {
            type: 'date_window',
            from: '2026-07-01T00:00:00.000Z',
            until: '2026-06-01T00:00:00.000Z',
          },
        ],
      })[0],
    ).toContain('from must be earlier than until');
  });

  test('min_score needs a score from 0 to 1', () => {
    expect(
      errorsOf({ version: 1, all: [{ type: 'min_score', score: 1.5 }] })[0],
    ).toContain('score must be a number from 0 to 1');
  });

  test('limits nesting depth', () => {
    let node: Record<string, unknown> = {
      all: [{ type: 'module_completed', moduleId: 'm' }],
    };
    for (let level = 0; level < MAX_AVAILABILITY_DEPTH; level += 1) {
      node = { all: [node] };
    }
    expect(errorsOf({ version: 1, ...node }).join('\n')).toContain(
      'nested deeper than',
    );
  });

  test('limits the total number of nodes and reports it once', () => {
    const many = Array.from({ length: MAX_AVAILABILITY_NODES + 10 }, () => ({
      type: 'group_member',
      groupId: 'g',
    }));
    const errors = errorsOf({ version: 1, all: many });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`more than ${MAX_AVAILABILITY_NODES}`);
  });
});

describe('referencedGroupIds', () => {
  test('collects group ids at any depth', () => {
    const rules = valueOf({
      version: 1,
      all: [
        { type: 'group_member', groupId: 'g1' },
        { any: [{ type: 'group_member', groupId: 'g2' }] },
        { type: 'module_completed', moduleId: 'm1' },
      ],
    });
    expect([...referencedGroupIds(rules)].sort()).toEqual(['g1', 'g2']);
  });

  test('no rules means no groups', () => {
    expect(referencedGroupIds(null).size).toBe(0);
  });
});
