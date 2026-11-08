import {
  type ActivityNodeTree,
  type PackageFileIndex,
  type ParsedPackage,
} from '@richardmcquiston01/reactive-lms-shared';
import {
  assertLaunchFile,
  packageRefusal,
  withParameters,
} from '../../import/launch-file';
import { normalizePackagePath } from '../../import/package-file-index';
import { parseCsv, parseIni, type CsvRow, type CsvTable } from './aicc-text';

const TIME_LIMIT_ACTIONS: Record<string, string> = {
  'e,m': 'exit,message',
  'e,n': 'exit,no message',
  'c,m': 'continue,message',
  'c,n': 'continue,no message',
};

/** AICC `HH:MM:SS`: hours of two to four digits. */
const TIMESPAN = /^\d{2,4}:[0-5]\d:[0-5]\d(?:\.\d{1,2})?$/;
const DECIMAL = /^\d+(?:\.\d+)?$/;
const ROOT = 'root';

interface AssignableUnit {
  id: string;
  node: ActivityNodeTree;
}

/**
 * Parses the course description files of an AICC package (level 1) into a
 * {@link ParsedPackage}: `.crs` for the course, `.au` for each assignable
 * unit and its launch file, `.des` for titles, and `.cst` for how the units
 * nest in blocks under `ROOT`.
 *
 * A package that cannot be launched or tracked as described is refused with
 * the unit and the problem named.
 *
 * @param files - Package file index (the four files are at the root)
 * @throws {LmsError} `PACKAGE_NOT_DETECTED` naming what is wrong
 */
export function parseAicc(files: PackageFileIndex): ParsedPackage {
  const found = findCourseFiles(files);
  const course = parseIni(found.course).get('course');
  if (!course) {
    throw packageRefusal('The AICC course file has no [Course] section.');
  }

  const descriptions = readDescriptions(found.descriptors);
  const units = readUnits(parseCsv(found.assignableUnits), descriptions, files);
  if (units.length === 0) {
    throw packageRefusal(
      'The AICC package has no assignable unit: its .au file has no rows.',
    );
  }
  const activities = buildTree(
    found.structure === undefined ? undefined : parseCsv(found.structure),
    units,
    descriptions,
  );
  const entryHref = firstHref(activities);
  if (!entryHref) {
    throw packageRefusal('The AICC package has no launchable unit.');
  }

  const id = course.values.get('course_id') ?? '';
  return {
    title: course.values.get('course_title') || id || 'AICC package',
    version: course.values.get('version') || undefined,
    entryHref,
    packageType: 'aicc',
    activities,
  };
}

interface CourseFiles {
  course: string;
  assignableUnits: string;
  descriptors?: string;
  structure?: string;
}

/**
 * Finds the four files at the package root. They share one base name; a
 * package with several courses is refused, since which to launch is unclear.
 */
function findCourseFiles(files: PackageFileIndex): CourseFiles {
  const byExtension = new Map<string, string[]>();
  for (const path of files.paths) {
    const normalized = normalizePackagePath(path);
    const dot = normalized.lastIndexOf('.');
    if (normalized.includes('/') || dot <= 0) {
      continue;
    }
    const extension = normalized.slice(dot + 1).toLowerCase();
    byExtension.set(extension, [
      ...(byExtension.get(extension) ?? []),
      normalized,
    ]);
  }
  const courses = byExtension.get('crs') ?? [];
  if (courses.length !== 1) {
    throw packageRefusal(
      courses.length === 0
        ? 'The AICC package has no .crs course file at its root.'
        : `The AICC package has ${courses.length} .crs files at its root (${courses.join(', ')}). It must hold one course.`,
    );
  }
  const courseFile = courses[0] as string;
  const base = courseFile.slice(0, courseFile.lastIndexOf('.')).toLowerCase();
  const read = (extension: string, required: boolean): string | undefined => {
    const candidates = byExtension.get(extension) ?? [];
    const match =
      candidates.find(
        (path) => path.slice(0, path.lastIndexOf('.')).toLowerCase() === base,
      ) ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (match === undefined) {
      if (required) {
        throw packageRefusal(
          `The AICC package has no .${extension} file named like "${courseFile}".`,
        );
      }
      return undefined;
    }
    const bytes = files.read(match);
    return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
  };
  return {
    course: read('crs', true) as string,
    assignableUnits: read('au', true) as string,
    descriptors: read('des', false),
    structure: read('cst', false),
  };
}

/** Titles by lower-cased `system_id`, from the `.des` file when there is one. */
function readDescriptions(source: string | undefined): Map<string, string> {
  const titles = new Map<string, string>();
  if (source === undefined) {
    return titles;
  }
  for (const row of parseCsv(source).rows) {
    const id = (row.get('system_id') ?? '').trim();
    const title = (row.get('title') ?? '').trim();
    if (id !== '' && title !== '') {
      titles.set(id.toLowerCase(), title);
    }
  }
  return titles;
}

function readUnits(
  table: CsvTable,
  titles: Map<string, string>,
  files: PackageFileIndex,
): AssignableUnit[] {
  for (const required of ['system_id', 'file_name']) {
    if (!table.columns.includes(required)) {
      throw packageRefusal(
        `The AICC .au file has no "${required}" column. Its columns are: ${table.columns.join(', ') || 'none'}.`,
      );
    }
  }
  const seen = new Set<string>();
  return table.rows.map((row) => {
    const id = (row.get('system_id') ?? '').trim();
    if (id === '') {
      throw packageRefusal(
        'An assignable unit in the .au file has no system_id.',
      );
    }
    if (seen.has(id.toLowerCase())) {
      throw packageRefusal(
        `The .au file lists the unit "${id}" more than once. Identifiers must be unique.`,
      );
    }
    seen.add(id.toLowerCase());
    return { id, node: unitNode(id, row, titles, files) };
  });
}

function unitNode(
  id: string,
  row: CsvRow,
  titles: Map<string, string>,
  files: PackageFileIndex,
): ActivityNodeTree {
  const fileName = (row.get('file_name') ?? '').trim();
  if (fileName === '') {
    throw packageRefusal(
      `The unit "${id}" has no file_name, so there is nothing to open.`,
    );
  }
  assertLaunchFile(`AICC unit "${id}"`, fileName, files);
  const metadata = unitMetadata(id, row);
  const node: ActivityNodeTree = {
    publisherId: id,
    title: titles.get(id.toLowerCase()) ?? id,
    href: withParameters(normalizePackagePath(fileName), row.get('web_launch')),
  };
  if (Object.keys(metadata).length > 0) {
    node.metadata = metadata;
  }
  return node;
}

/** What the unit tells the content and the LMS, each limited as AICC says. */
function unitMetadata(id: string, row: CsvRow): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  const mastery = (row.get('mastery_score') ?? '').trim();
  if (mastery !== '') {
    if (!DECIMAL.test(mastery) || Number(mastery) > 100) {
      throw packageRefusal(
        `The unit "${id}" has mastery_score "${mastery}". It must be a number from 0 to 100.`,
      );
    }
    metadata['masteryScore'] = Number(mastery);
  }
  const maxScore = (row.get('max_score') ?? '').trim();
  if (maxScore !== '') {
    if (!DECIMAL.test(maxScore)) {
      throw packageRefusal(
        `The unit "${id}" has max_score "${maxScore}". It must be a number.`,
      );
    }
    metadata['maxScore'] = Number(maxScore);
  }
  const maxTime = (row.get('max_time_allowed') ?? '').trim();
  if (maxTime !== '') {
    if (!TIMESPAN.test(maxTime)) {
      throw packageRefusal(
        `The unit "${id}" has max_time_allowed "${maxTime}". It must be a time such as 00:30:00.`,
      );
    }
    // All zeros is how a package says there is no limit.
    if (/[1-9]/.test(maxTime)) {
      metadata['maxTimeAllowed'] = maxTime;
    }
  }
  const action = (row.get('time_limit_action') ?? '').trim();
  if (action !== '') {
    const normalized =
      TIME_LIMIT_ACTIONS[action.replace(/\s+/g, '').toLowerCase()];
    if (normalized === undefined) {
      throw packageRefusal(
        `The unit "${id}" has time_limit_action "${action}". It must be one of E,M; E,N; C,M; C,N.`,
      );
    }
    metadata['timeLimitAction'] = normalized;
  }
  const launchData = (row.get('core_vendor') ?? '').trim();
  if (launchData !== '') {
    metadata['launchData'] = launchData;
  }
  return metadata;
}

/**
 * Builds the activity tree from the `.cst` file: blocks and units nest under
 * `ROOT`, in file order. Units the structure leaves out follow at the top
 * level, and with no `.cst` every unit is at the top level.
 */
function buildTree(
  structure: CsvTable | undefined,
  units: AssignableUnit[],
  titles: Map<string, string>,
): ActivityNodeTree[] {
  const unitById = new Map(units.map((unit) => [unit.id.toLowerCase(), unit]));
  const members = new Map<string, string[]>();
  const placed = new Set<string>();
  for (const row of structure?.rows ?? []) {
    const block = (row.get('block') ?? '').trim();
    const member = (row.get('member') ?? '').trim();
    if (block === '' || member === '') {
      continue;
    }
    if (placed.has(member.toLowerCase())) {
      throw packageRefusal(
        `The structure file lists "${member}" more than once. Each unit and block belongs in one place.`,
      );
    }
    placed.add(member.toLowerCase());
    members.set(block.toLowerCase(), [
      ...(members.get(block.toLowerCase()) ?? []),
      member,
    ]);
  }
  if (
    structure !== undefined &&
    structure.rows.length > 0 &&
    !members.has(ROOT)
  ) {
    throw packageRefusal(
      'The structure file has no ROOT block, so the units are not placed in the course.',
    );
  }

  const visiting = new Set<string>();
  const nodeFor = (id: string): ActivityNodeTree => {
    const key = id.toLowerCase();
    const unit = unitById.get(key);
    if (unit) {
      return unit.node;
    }
    if (!members.has(key)) {
      throw packageRefusal(
        `The structure file names "${id}", which is neither a unit in the .au file nor a block with members.`,
      );
    }
    if (visiting.has(key)) {
      throw packageRefusal(
        `The structure file puts the block "${id}" inside itself.`,
      );
    }
    visiting.add(key);
    const children = (members.get(key) ?? []).map(nodeFor);
    visiting.delete(key);
    return { publisherId: id, title: titles.get(key) ?? id, children };
  };

  const top = (members.get(ROOT) ?? []).map(nodeFor);
  const leftOut = units.filter((unit) => !placed.has(unit.id.toLowerCase()));
  return [...top, ...leftOut.map((unit) => unit.node)];
}

/** The first launchable node, depth first. */
function firstHref(activities: ActivityNodeTree[]): string | undefined {
  for (const node of activities) {
    if (node.href) {
      return node.href;
    }
    const nested = node.children ? firstHref(node.children) : undefined;
    if (nested) {
      return nested;
    }
  }
  return undefined;
}
