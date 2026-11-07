import type { CmiValues } from '@richardmcquiston01/reactive-lms-shared';

/** One interaction pulled out of the flat `cmi.interactions.n.*` map. */
export interface InteractionRecord {
  interactionIndex: number;
  interactionId: string | null;
  interactionType: string | null;
  objectiveIds: string[];
  correctPatterns: string[];
  timeOfDay: string | null;
  studentResponse: string | null;
  result: string | null;
  weighting: string | null;
  latency: string | null;
}

const ELEMENT = /^cmi\.interactions\.(\d+)\.(.+)$/;
const NESTED = {
  objectives: /^objectives\.(\d+)\.id$/,
  correct_responses: /^correct_responses\.(\d+)\.pattern$/,
} as const;

/**
 * Groups the flat CMI map into one record per interaction, ordered by the
 * SCO's index. Objective ids and correct patterns are ordered by their own
 * index. Elements that are not part of the SCORM 1.2 interaction model are
 * ignored.
 *
 * @param values - Flat CMI element map
 */
export function extractInteractions(values: CmiValues): InteractionRecord[] {
  const byIndex = new Map<number, Map<string, string>>();
  for (const [key, value] of Object.entries(values)) {
    const match = ELEMENT.exec(key);
    if (!match) {
      continue;
    }
    const index = Number(match[1]);
    const fields = byIndex.get(index) ?? new Map<string, string>();
    fields.set(match[2] ?? '', value);
    byIndex.set(index, fields);
  }

  return [...byIndex.entries()]
    .sort(([left], [right]) => left - right)
    .map(([interactionIndex, fields]) => ({
      interactionIndex,
      interactionId: fields.get('id') ?? null,
      interactionType: fields.get('type') ?? null,
      objectiveIds: nestedList(fields, 'objectives'),
      correctPatterns: nestedList(fields, 'correct_responses'),
      timeOfDay: fields.get('time') ?? null,
      studentResponse: fields.get('student_response') ?? null,
      result: fields.get('result') ?? null,
      weighting: fields.get('weighting') ?? null,
      latency: fields.get('latency') ?? null,
    }));
}

function nestedList(
  fields: Map<string, string>,
  group: 'objectives' | 'correct_responses',
): string[] {
  const entries: Array<[number, string]> = [];
  for (const [field, value] of fields) {
    const match = NESTED[group].exec(field);
    if (match) {
      entries.push([Number(match[1]), value]);
    }
  }
  return entries.sort(([a], [b]) => a - b).map(([, value]) => value);
}
