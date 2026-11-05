import type {
  PersonSummaryDto,
  RegistrationStatus,
  SectionRegistrationDto,
} from '@richardmcquiston01/reactive-lms-shared';

/** Statuses in the order the progress summary lists them. */
export const REGISTRATION_STATUSES: readonly RegistrationStatus[] = [
  'not_started',
  'in_progress',
  'completed',
  'passed',
  'failed',
  'waived',
];

const STATUS_LABELS: Record<RegistrationStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  passed: 'Passed',
  failed: 'Failed',
  waived: 'Waived',
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Name to show for a person: display name, else email, else the host's
 * identifier, else the person id, so no row is ever blank.
 *
 * @param row - A roster row
 */
export function rosterPersonLabel(row: SectionRegistrationDto): string {
  return row.displayName || row.email || row.externalId || row.personId;
}

/**
 * Readable name for a registration status.
 *
 * @param status - Registration status
 */
export function statusLabel(status: RegistrationStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/**
 * Score as a whole percentage, or a dash when none has been recorded.
 *
 * @param scoreScaled - Scaled score, 0..1
 */
export function formatScore(scoreScaled: number | undefined): string {
  if (scoreScaled === undefined || !Number.isFinite(scoreScaled)) {
    return '—';
  }
  return `${Math.round(scoreScaled * 100)}%`;
}

/**
 * Duration such as `PT1H5M3S` as `1h 5m 3s`. A value that is not a plain
 * time-only ISO-8601 duration is shown as it came, and a missing one as a dash.
 *
 * @param iso - ISO-8601 duration
 */
export function formatDuration(iso: string | undefined): string {
  if (!iso) {
    return '—';
  }
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(iso);
  if (match === null || (!match[1] && !match[2] && !match[3])) {
    return iso;
  }
  const parts: string[] = [];
  if (match[1]) parts.push(`${Number(match[1])}h`);
  if (match[2]) parts.push(`${Number(match[2])}m`);
  if (match[3]) parts.push(`${Math.round(Number(match[3]))}s`);
  return parts.join(' ');
}

/**
 * Counts registrations by status.
 *
 * @param rows - Roster rows
 */
export function countByStatus(
  rows: readonly SectionRegistrationDto[],
): Record<RegistrationStatus, number> {
  const counts: Record<RegistrationStatus, number> = {
    not_started: 0,
    in_progress: 0,
    completed: 0,
    passed: 0,
    failed: 0,
    waived: 0,
  };
  for (const row of rows) {
    if (row.status in counts) {
      counts[row.status] += 1;
    }
  }
  return counts;
}

/**
 * Checks the person id typed into the enrol form before it is sent.
 *
 * @param raw - Text as typed
 * @returns A message to show, or `null` when the id looks valid
 */
export function checkPersonId(raw: string): string | null {
  const id = raw.trim();
  if (id === '') {
    return 'Enter the id of the person to enrol.';
  }
  if (!UUID_PATTERN.test(id)) {
    return 'A person id is a UUID, for example 123e4567-e89b-42d3-a456-426614174000.';
  }
  return null;
}

/**
 * Text for one entry in the person picker: the name with the email beside it
 * when both are known, so two people with the same name can be told apart.
 * Falls back to the email, then the host's identifier.
 *
 * @param person - A person found by the search
 */
export function personChoiceLabel(person: PersonSummaryDto): string {
  const name = person.displayName;
  if (name && person.email) {
    return `${name} (${person.email})`;
  }
  return name || person.email || person.externalId;
}
