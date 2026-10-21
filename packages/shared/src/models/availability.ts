/**
 * One test a learner must pass for a module to be available (D5).
 *
 * - `module_completed`: another module in the section is completed
 * - `date_window`: now is inside `from` and `until` (either may be omitted)
 * - `min_score`: a module's scaled score (0 to 1) is at least `score`;
 *   `moduleId` defaults to the module the rule is attached to
 * - `group_member`: the learner belongs to the LIS group
 */
export type AvailabilityCondition =
  | { type: 'module_completed'; moduleId: string }
  | { type: 'date_window'; from?: string; until?: string }
  | { type: 'min_score'; moduleId?: string; score: number }
  | { type: 'group_member'; groupId: string };

/**
 * A set of nodes that must all hold (`all`) or of which one must hold (`any`).
 */
export type AvailabilityGroup =
  { all: AvailabilityNode[] } | { any: AvailabilityNode[] };

/**
 * A condition, or a nested group of them.
 */
export type AvailabilityNode = AvailabilityCondition | AvailabilityGroup;

/**
 * Version 1 availability rules as stored on a course module.
 */
export type AvailabilityV1 = { version: 1 } & AvailabilityGroup;

/**
 * Version 0 availability: the single-object shape used before conditions
 * became a list. Still accepted on input and on stored rows, and upcast to
 * {@link AvailabilityV1} when read.
 */
export interface AvailabilityV0 {
  afterModuleId?: string;
  availableFrom?: string;
  availableUntil?: string;
  minScore?: number;
}

/**
 * Outcome of {@link parseAvailability}.
 */
export type AvailabilityParseResult =
  { ok: true; value: AvailabilityV1 | null } | { ok: false; errors: string[] };

/** Deepest nesting of `all` and `any` groups accepted. */
export const MAX_AVAILABILITY_DEPTH = 5;

/** Most conditions and groups accepted in one rule set. */
export const MAX_AVAILABILITY_NODES = 50;

const LEGACY_KEYS = [
  'afterModuleId',
  'availableFrom',
  'availableUntil',
  'minScore',
] as const;

/**
 * Validates availability input or a stored row and returns it as version 1.
 *
 * Accepts `null` or `undefined` (no rules), an empty object, a version 0
 * object, or a version 1 rule set. Every problem is reported with its path,
 * so an API caller can fix them in one pass.
 *
 * @param value - Untrusted availability value
 */
export function parseAvailability(value: unknown): AvailabilityParseResult {
  if (value === null || value === undefined) {
    return { ok: true, value: null };
  }
  if (!isRecord(value)) {
    return {
      ok: false,
      errors: ['availability must be an object, null, or omitted.'],
    };
  }

  if ('version' in value) {
    return parseV1(value);
  }
  return parseV0(value);
}

/**
 * Lists the group ids a rule set refers to, so a caller can load only the
 * memberships it needs.
 *
 * @param rules - Parsed availability rules
 */
export function referencedGroupIds(rules: AvailabilityV1 | null): Set<string> {
  const found = new Set<string>();
  const visit = (node: AvailabilityNode): void => {
    if ('type' in node) {
      if (node.type === 'group_member') {
        found.add(node.groupId);
      }
      return;
    }
    for (const child of 'all' in node ? node.all : node.any) {
      visit(child);
    }
  };
  if (rules) {
    visit(rules);
  }
  return found;
}

function parseV0(value: Record<string, unknown>): AvailabilityParseResult {
  const errors: string[] = [];
  const conditions: AvailabilityCondition[] = [];

  for (const key of Object.keys(value)) {
    if (!(LEGACY_KEYS as readonly string[]).includes(key)) {
      errors.push(`Unknown availability field "${key}".`);
    }
  }

  const { afterModuleId, availableFrom, availableUntil, minScore } = value;

  if (availableFrom !== undefined || availableUntil !== undefined) {
    const window = readWindow('', availableFrom, availableUntil, errors);
    if (window) {
      conditions.push(window);
    }
  }
  if (afterModuleId !== undefined) {
    if (typeof afterModuleId === 'string' && afterModuleId !== '') {
      conditions.push({ type: 'module_completed', moduleId: afterModuleId });
    } else {
      errors.push('afterModuleId must be a non-empty string.');
    }
  }
  if (minScore !== undefined) {
    if (isScore(minScore)) {
      conditions.push({
        type: 'min_score',
        ...(typeof afterModuleId === 'string' && afterModuleId !== ''
          ? { moduleId: afterModuleId }
          : {}),
        score: minScore,
      });
    } else {
      errors.push('minScore must be a number from 0 to 1.');
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: conditions.length === 0 ? null : { version: 1, all: conditions },
  };
}

function parseV1(value: Record<string, unknown>): AvailabilityParseResult {
  if (value['version'] !== 1) {
    return {
      ok: false,
      errors: [
        `Unsupported availability version ${JSON.stringify(value['version'])}; this release understands version 1.`,
      ],
    };
  }

  const errors: string[] = [];
  const budget = { nodes: 0 };
  const group = readGroup(value, '', 1, budget, errors);

  if (errors.length > 0 || !group) {
    return { ok: false, errors };
  }
  const children = 'all' in group ? group.all : group.any;
  if ('all' in group && children.length === 0) {
    return { ok: true, value: null };
  }
  return { ok: true, value: { version: 1, ...group } };
}

function readGroup(
  value: Record<string, unknown>,
  path: string,
  depth: number,
  budget: { nodes: number },
  errors: string[],
): AvailabilityGroup | undefined {
  const where = path === '' ? 'availability' : path;

  if (depth > MAX_AVAILABILITY_DEPTH) {
    errors.push(
      `${where}: groups are nested deeper than ${MAX_AVAILABILITY_DEPTH}.`,
    );
    return undefined;
  }

  const hasAll = 'all' in value;
  const hasAny = 'any' in value;
  if (hasAll === hasAny) {
    errors.push(`${where}: a group needs exactly one of "all" or "any".`);
    return undefined;
  }

  const key = hasAll ? 'all' : 'any';
  const raw = value[key];
  if (!Array.isArray(raw)) {
    errors.push(`${where}.${key} must be an array.`);
    return undefined;
  }
  if (key === 'any' && raw.length === 0) {
    errors.push(
      `${where}.any must list at least one condition, because an empty "any" can never be satisfied.`,
    );
    return undefined;
  }

  const children: AvailabilityNode[] = [];
  raw.forEach((child: unknown, index: number) => {
    const childPath = `${where}.${key}[${index}]`;
    budget.nodes += 1;
    if (budget.nodes > MAX_AVAILABILITY_NODES) {
      if (budget.nodes === MAX_AVAILABILITY_NODES + 1) {
        errors.push(
          `availability has more than ${MAX_AVAILABILITY_NODES} conditions and groups.`,
        );
      }
      return;
    }
    const node = readNode(child, childPath, depth, budget, errors);
    if (node) {
      children.push(node);
    }
  });

  return key === 'all' ? { all: children } : { any: children };
}

function readNode(
  value: unknown,
  path: string,
  depth: number,
  budget: { nodes: number },
  errors: string[],
): AvailabilityNode | undefined {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return undefined;
  }
  if ('all' in value || 'any' in value) {
    return readGroup(value, path, depth + 1, budget, errors);
  }

  switch (value['type']) {
    case 'module_completed':
      return nonEmpty(value['moduleId'])
        ? { type: 'module_completed', moduleId: value['moduleId'] }
        : (errors.push(`${path}.moduleId must be a non-empty string.`),
          undefined);
    case 'group_member':
      return nonEmpty(value['groupId'])
        ? { type: 'group_member', groupId: value['groupId'] }
        : (errors.push(`${path}.groupId must be a non-empty string.`),
          undefined);
    case 'min_score': {
      const moduleId = value['moduleId'];
      let ok = true;
      if (moduleId !== undefined && !nonEmpty(moduleId)) {
        errors.push(`${path}.moduleId must be a non-empty string when given.`);
        ok = false;
      }
      if (!isScore(value['score'])) {
        errors.push(`${path}.score must be a number from 0 to 1.`);
        ok = false;
      }
      return ok
        ? {
            type: 'min_score',
            ...(typeof moduleId === 'string' ? { moduleId } : {}),
            score: value['score'] as number,
          }
        : undefined;
    }
    case 'date_window':
      return readWindow(path, value['from'], value['until'], errors);
    default:
      errors.push(
        `${path}.type must be one of module_completed, date_window, min_score, group_member (got ${JSON.stringify(value['type'])}).`,
      );
      return undefined;
  }
}

function readWindow(
  path: string,
  from: unknown,
  until: unknown,
  errors: string[],
): AvailabilityCondition | undefined {
  const prefix = path === '' ? '' : `${path}.`;
  const fromName = path === '' ? 'availableFrom' : 'from';
  const untilName = path === '' ? 'availableUntil' : 'until';
  let ok = true;

  for (const [name, raw] of [
    [fromName, from],
    [untilName, until],
  ] as const) {
    if (raw !== undefined && !isInstant(raw)) {
      errors.push(`${prefix}${name} must be an ISO 8601 date-time string.`);
      ok = false;
    }
  }
  if (from === undefined && until === undefined) {
    errors.push(
      `${prefix || 'availability'} date window needs "${fromName}" or "${untilName}".`,
    );
    ok = false;
  }
  if (
    ok &&
    typeof from === 'string' &&
    typeof until === 'string' &&
    Date.parse(from) >= Date.parse(until)
  ) {
    errors.push(`${prefix}${fromName} must be earlier than ${untilName}.`);
    ok = false;
  }
  if (!ok) {
    return undefined;
  }
  return {
    type: 'date_window',
    ...(typeof from === 'string' ? { from } : {}),
    ...(typeof until === 'string' ? { until } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isScore(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= 1;
}

function isInstant(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}
