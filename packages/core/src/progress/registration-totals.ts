/**
 * The progress fields a section total reads from one stored row.
 */
export interface TotalsRow {
  /** Module the row belongs to. */
  courseModuleId: string;
  /** Scaled score 0..1 as stored text, if reported. */
  scoreScaled?: string | null;
  /** Time spent as an ISO-8601 duration, if reported. */
  totalTimeIso8601?: string | null;
}

/**
 * Section score: the mean of each module's best scaled score. Only modules
 * that have reported a score count, so an unscored module does not pull the
 * average down; a section where nothing has a score has none.
 *
 * @param moduleIds - Modules that count toward the section
 * @param rows - Stored progress rows for the registration
 * @returns The mean 0..1, or `null` when no module has a score
 */
export function sectionScore(
  moduleIds: readonly string[],
  rows: readonly TotalsRow[],
): number | null {
  const counted = new Set(moduleIds);
  const best = new Map<string, number>();
  for (const row of rows) {
    if (!counted.has(row.courseModuleId)) {
      continue;
    }
    const score =
      row.scoreScaled === null || row.scoreScaled === undefined
        ? Number.NaN
        : Number(row.scoreScaled);
    if (Number.isFinite(score)) {
      const current = best.get(row.courseModuleId);
      best.set(
        row.courseModuleId,
        current === undefined ? score : Math.max(current, score),
      );
    }
  }
  if (best.size === 0) {
    return null;
  }
  const total = [...best.values()].reduce((sum, score) => sum + score, 0);
  return total / best.size;
}

/**
 * Section time: the sum of the time reported by every row of the section's
 * modules.
 *
 * @param moduleIds - Modules that count toward the section
 * @param rows - Stored progress rows for the registration
 * @returns An ISO-8601 duration such as `PT1H5M3S`, or `null` when no time was reported
 */
export function sectionDuration(
  moduleIds: readonly string[],
  rows: readonly TotalsRow[],
): string | null {
  const counted = new Set(moduleIds);
  let seconds = 0;
  let any = false;
  for (const row of rows) {
    if (!counted.has(row.courseModuleId) || !row.totalTimeIso8601) {
      continue;
    }
    const parsed = parseIsoDuration(row.totalTimeIso8601);
    if (parsed !== undefined) {
      seconds += parsed;
      any = true;
    }
  }
  return any ? formatIsoDuration(seconds) : null;
}

/** Seconds in a `PnDTnHnMnS` duration; years, months, and weeks are not fixed lengths and are not read. */
function parseIsoDuration(value: string): number | undefined {
  const match =
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
      value,
    );
  if (match === null || value === 'P' || value.endsWith('T')) {
    return undefined;
  }
  const [, days, hours, minutes, seconds] = match;
  return (
    Number(days ?? 0) * 86400 +
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0)
  );
}

function formatIsoDuration(totalSeconds: number): string {
  const rounded = Math.round(totalSeconds * 100) / 100;
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = Math.round((rounded % 60) * 100) / 100;
  const parts = ['PT'];
  if (hours > 0) parts.push(`${hours}H`);
  if (minutes > 0) parts.push(`${minutes}M`);
  if (seconds > 0) parts.push(`${seconds}S`);
  return parts.length === 1 ? 'PT0S' : parts.join('');
}
