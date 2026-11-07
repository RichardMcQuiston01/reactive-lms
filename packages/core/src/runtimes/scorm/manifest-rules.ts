import {
  LmsError,
  PACKAGE_NOT_DETECTED,
  httpStatusForLmsCode,
} from '@richardmcquiston01/reactive-lms-shared';
import {
  attr,
  childrenNamed,
  firstChild,
  textOf,
  type XmlElement,
} from './manifest-xml';

/** `adlcp:timelimitaction` values defined by SCORM 1.2. */
const TIME_LIMIT_ACTIONS = new Set([
  'exit,message',
  'exit,no message',
  'continue,message',
  'continue,no message',
]);

/** CMITimespan: `HHHH:MM:SS.SS`, with two to four hour digits. */
const TIMESPAN = /^\d{2,4}:[0-5]\d:[0-5]\d(?:\.\d{1,2})?$/;

const DECIMAL = /^\d+(?:\.\d+)?$/;
const MAX_DATA_FROM_LMS = 255;

/**
 * Checks a manifest against the Content Aggregation Model rules of SCORM 1.2
 * (IMS Content Packaging 1.1.2 with ADL's extensions) that decide whether a
 * course can be launched and tracked. A manifest that breaks one is refused at
 * import with the item or resource and the problem named, instead of
 * misbehaving when a learner launches it.
 *
 * Rules about style, and fields no LMS behaviour depends on (such as
 * `<metadata>` details beyond the schema version), are read leniently.
 *
 * @param organizationsEl - The `<organizations>` element, when present
 * @param resourcesEl - The `<resources>` element, when present
 * @throws {LmsError} `PACKAGE_NOT_DETECTED` naming the first rule broken
 */
export function assertManifestRules(
  organizationsEl: XmlElement | undefined,
  resourcesEl: XmlElement | undefined,
): void {
  const organizations = childrenNamed(organizationsEl, 'organization');
  assertOrganizations(organizationsEl, organizations);
  const resourceIds = assertResources(resourcesEl);
  const seenItems = new Set<string>();
  for (const organization of organizations) {
    for (const item of childrenNamed(organization, 'item')) {
      assertItem(item, resourceIds, seenItems);
    }
  }
  assertResourcesLaunchable(resourcesEl, organizations);
}

function assertOrganizations(
  organizationsEl: XmlElement | undefined,
  organizations: XmlElement[],
): void {
  const seen = new Set<string>();
  for (const organization of organizations) {
    const id = attr(organization, 'identifier');
    if (id === undefined) {
      continue;
    }
    if (seen.has(id)) {
      throw refusal(
        `The manifest defines the organization "${id}" more than once. Identifiers must be unique.`,
      );
    }
    seen.add(id);
  }
  const defaultId = attr(organizationsEl, 'default');
  if (defaultId && organizations.length > 0 && !seen.has(defaultId)) {
    throw refusal(
      `The manifest's default organization "${defaultId}" is not one of its organizations.`,
    );
  }
}

/** Checks each resource and returns the identifiers defined. */
function assertResources(resourcesEl: XmlElement | undefined): Set<string> {
  const ids = new Set<string>();
  const resources = childrenNamed(resourcesEl, 'resource');
  for (const resource of resources) {
    const id = attr(resource, 'identifier');
    if (!id) {
      throw refusal(
        `A resource${hrefNote(resource)} has no identifier. Every resource needs one.`,
      );
    }
    if (ids.has(id)) {
      throw refusal(
        `The manifest defines the resource "${id}" more than once. Identifiers must be unique.`,
      );
    }
    ids.add(id);
  }
  for (const resource of resources) {
    const id = attr(resource, 'identifier') ?? '';
    const type = attr(resource, 'type');
    if (type !== undefined && type.toLowerCase() !== 'webcontent') {
      throw refusal(
        `Resource "${id}" has type "${type}". SCORM 1.2 resources must be of type "webcontent".`,
      );
    }
    const scormType = attr(resource, 'scormtype');
    if (
      scormType !== undefined &&
      !['sco', 'asset'].includes(scormType.toLowerCase())
    ) {
      throw refusal(
        `Resource "${id}" has scormtype "${scormType}". It must be "sco" or "asset".`,
      );
    }
    for (const dependency of childrenNamed(resource, 'dependency')) {
      const target = attr(dependency, 'identifierref');
      if (!target || !ids.has(target)) {
        throw refusal(
          `Resource "${id}" depends on "${target ?? ''}", which the manifest does not define.`,
        );
      }
    }
  }
  return ids;
}

function assertItem(
  item: XmlElement,
  resourceIds: Set<string>,
  seen: Set<string>,
): void {
  const id = attr(item, 'identifier');
  const label = textOf(item, 'title') || id || 'untitled';
  if (!id) {
    throw refusal(
      `The item "${label}" has no identifier. Every item needs one.`,
    );
  }
  if (seen.has(id)) {
    throw refusal(
      `The manifest defines the item "${id}" more than once. Identifiers must be unique.`,
    );
  }
  seen.add(id);

  const target = attr(item, 'identifierref');
  if (target !== undefined && !resourceIds.has(target)) {
    throw refusal(
      `The item "${id}" refers to the resource "${target}", which the manifest does not define.`,
    );
  }
  assertItemExtensions(item, id);
  for (const child of childrenNamed(item, 'item')) {
    assertItem(child, resourceIds, seen);
  }
}

/** A resource an item launches must say what to launch. */
function assertResourcesLaunchable(
  resourcesEl: XmlElement | undefined,
  organizations: XmlElement[],
): void {
  const launched = new Set<string>();
  const collect = (item: XmlElement): void => {
    const target = attr(item, 'identifierref');
    if (target) {
      launched.add(target);
    }
    childrenNamed(item, 'item').forEach(collect);
  };
  organizations.forEach((organization) =>
    childrenNamed(organization, 'item').forEach(collect),
  );
  for (const resource of childrenNamed(resourcesEl, 'resource')) {
    const id = attr(resource, 'identifier') ?? '';
    if (launched.has(id) && !attr(resource, 'href')) {
      throw refusal(
        `Resource "${id}" is launched by an item but has no href, so there is nothing to open.`,
      );
    }
  }
}

/** `adlcp:` elements on an item, each limited as the specification says. */
function assertItemExtensions(item: XmlElement, id: string): void {
  const mastery = textOf(item, 'masteryscore');
  if (mastery !== '' && !(DECIMAL.test(mastery) && Number(mastery) <= 100)) {
    throw refusal(
      `Item "${id}" has masteryscore "${mastery}". It must be a number from 0 to 100.`,
    );
  }
  const action = textOf(item, 'timelimitaction');
  if (action !== '' && !TIME_LIMIT_ACTIONS.has(action)) {
    throw refusal(
      `Item "${id}" has timelimitaction "${action}". It must be one of: ${[...TIME_LIMIT_ACTIONS].join('; ')}.`,
    );
  }
  const maxTime = textOf(item, 'maxtimeallowed');
  if (maxTime !== '' && !TIMESPAN.test(maxTime)) {
    throw refusal(
      `Item "${id}" has maxtimeallowed "${maxTime}". It must be a time span such as 00:30:00.`,
    );
  }
  const data = firstChild(item, 'datafromlms')?.text.trim() ?? '';
  if (data.length > MAX_DATA_FROM_LMS) {
    throw refusal(
      `Item "${id}" has datafromlms of ${data.length} characters. The limit is ${MAX_DATA_FROM_LMS}.`,
    );
  }
}

function hrefNote(resource: XmlElement): string {
  const href = attr(resource, 'href');
  return href ? ` (href "${href}")` : '';
}

function refusal(message: string): LmsError {
  return new LmsError({
    status: httpStatusForLmsCode(PACKAGE_NOT_DETECTED),
    code: PACKAGE_NOT_DETECTED,
    message,
  });
}
