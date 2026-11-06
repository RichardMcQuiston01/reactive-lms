import {
  LmsError,
  PACKAGE_NOT_DETECTED,
  httpStatusForLmsCode,
  type ActivityNodeTree,
  type PackageFileIndex,
  type ParsedPackage,
} from '@richardmcquiston01/reactive-lms-shared';
import { normalizePackagePath } from '../../import/package-file-index';

interface XmlElement {
  localName: string;
  attrs: Record<string, string>;
  text: string;
  children: XmlElement[];
}

interface ResourceRef {
  /** Launch path inside the package, with any query the manifest gave. */
  href?: string;
  /** Lower-cased `adlcp:scormtype`: `sco` or `asset`. */
  scormType?: string;
}

/**
 * Parses a SCORM `imsmanifest.xml` into a {@link ParsedPackage} activity tree.
 * Organizations/items plus `resources/resource@href`; first SCO is the entry.
 *
 * @param files - Package file index (must include root `imsmanifest.xml`)
 */
export function parseImsmanifest(files: PackageFileIndex): ParsedPackage {
  const xml = readManifestXml(files);
  if (xml === undefined) {
    throw new LmsError({
      status: httpStatusForLmsCode(PACKAGE_NOT_DETECTED),
      code: PACKAGE_NOT_DETECTED,
      message: 'SCORM package is missing imsmanifest.xml.',
    });
  }

  const root = parseXml(xml);
  const manifest = findDescendant(root, 'manifest') ?? root;
  if (manifest.localName !== 'manifest') {
    throw notDetected('imsmanifest.xml is not a SCORM manifest.');
  }

  const organizations = firstChild(manifest, 'organizations');
  const resourcesEl = firstChild(manifest, 'resources');
  const defaultOrgId = attr(organizations, 'default');
  const orgs = childrenNamed(organizations, 'organization');
  const organization =
    (defaultOrgId
      ? orgs.find((entry) => attr(entry, 'identifier') === defaultOrgId)
      : undefined) ?? orgs[0];
  if (!organization) {
    throw notDetected('SCORM manifest has no organization.');
  }

  const resources = indexResources(
    resourcesEl,
    joinBase(attr(manifest, 'base'), attr(resourcesEl, 'base')),
  );
  const activities = childrenNamed(organization, 'item').map((item) =>
    itemToActivity(item, resources),
  );
  assertLaunchFilesExist(activities, files);
  const entryHref = firstScoHref(activities) ?? firstHref(activities);
  if (!entryHref) {
    throw notDetected('SCORM manifest has no launchable SCO.');
  }

  const title =
    textOf(organization, 'title') ||
    attr(manifest, 'identifier') ||
    'SCORM package';
  const schemaversion = schemaVersionOf(manifest);
  const version = schemaversion || attr(manifest, 'version') || undefined;

  return {
    title,
    version,
    entryHref,
    packageType: detectScormType(schemaversion),
    activities,
  };
}

function readManifestXml(files: PackageFileIndex): string | undefined {
  for (const path of files.paths) {
    const normalized = normalizePackagePath(path);
    if (normalized.toLowerCase() === 'imsmanifest.xml') {
      return decodeUtf8(files.read(path) ?? files.read(normalized));
    }
  }
  return decodeUtf8(files.read('imsmanifest.xml'));
}

function itemToActivity(
  item: XmlElement,
  resources: Map<string, ResourceRef>,
): ActivityNodeTree {
  const identifierref = attr(item, 'identifierref');
  const resource = identifierref ? resources.get(identifierref) : undefined;
  const href = resource?.href
    ? withParameters(resource.href, attr(item, 'parameters'))
    : undefined;
  const childItems = childrenNamed(item, 'item');
  const scormType = (
    attr(item, 'scormtype') ??
    resource?.scormType ??
    ''
  ).toLowerCase();
  const metadata = metadataFrom({
    scormType: scormType || undefined,
    launchData: textOf(item, 'datafromlms'),
    masteryScore: numberOf(item, 'masteryscore'),
    maxTimeAllowed: textOf(item, 'maxtimeallowed'),
    timeLimitAction: textOf(item, 'timelimitaction'),
  });

  const node: ActivityNodeTree = {
    publisherId: attr(item, 'identifier'),
    title: textOf(item, 'title') || identifierref || 'Activity',
  };
  if (href) {
    node.href = href;
  }
  if (metadata) {
    node.metadata = metadata;
  }
  if (childItems.length > 0) {
    node.children = childItems.map((child) => itemToActivity(child, resources));
  }
  return node;
}

function indexResources(
  resourcesEl: XmlElement | undefined,
  inheritedBase: string,
): Map<string, ResourceRef> {
  const map = new Map<string, ResourceRef>();
  for (const resource of childrenNamed(resourcesEl, 'resource')) {
    const identifier = attr(resource, 'identifier');
    if (!identifier) {
      continue;
    }
    const href = attr(resource, 'href');
    const scormType = attr(resource, 'scormtype');
    map.set(identifier, {
      href: href
        ? resolveAgainstBase(
            joinBase(inheritedBase, attr(resource, 'base')),
            href,
          )
        : undefined,
      scormType: scormType ? scormType.toLowerCase() : undefined,
    });
  }
  return map;
}

/**
 * Joins `xml:base` values from the outside in. A base is a folder inside the
 * package, so a trailing slash is added when the manifest left it off.
 */
function joinBase(
  outer: string | undefined,
  inner: string | undefined,
): string {
  const parts = [outer, inner]
    .map((part) => normalizePackagePath(part ?? '').replace(/\/+$/, ''))
    .filter((part) => part !== '');
  return parts.length === 0 ? '' : `${parts.join('/')}/`;
}

/**
 * Puts a resource `href` under its `xml:base`. An address with a scheme
 * (`https://...`) or one that starts with `/` is left alone, so it is caught
 * later as a file outside the package.
 */
function resolveAgainstBase(base: string, href: string): string {
  const cleaned = href.trim();
  if (
    base === '' ||
    /^[a-z][a-z0-9+.-]*:/i.test(cleaned) ||
    /^[/\\]/.test(cleaned)
  ) {
    return normalizePackagePath(cleaned);
  }
  return normalizePackagePath(`${base}${cleaned}`);
}

/**
 * Applies an item's `parameters` to its launch address, as the SCORM 1.2
 * content aggregation model describes: they are appended to the resource
 * address. A `?` where the address already has a query continues that query,
 * and a `&` where it has none starts one.
 */
function withParameters(href: string, parameters: string | undefined): string {
  const extra = parameters?.trim() ?? '';
  if (extra === '') {
    return href;
  }
  if (extra.startsWith('#')) {
    return `${href}${extra}`;
  }
  const hasQuery = href.includes('?');
  if (extra.startsWith('?') || extra.startsWith('&')) {
    const rest = extra.slice(1);
    return `${href}${hasQuery ? '&' : '?'}${rest}`;
  }
  return `${href}${hasQuery ? '&' : '?'}${extra}`;
}

/** First launchable item whose resource is a SCO, depth first. */
function firstScoHref(activities: ActivityNodeTree[]): string | undefined {
  for (const node of activities) {
    if (node.href && node.metadata?.['scormType'] === 'sco') {
      return node.href;
    }
    const nested = node.children ? firstScoHref(node.children) : undefined;
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

/** First launchable item of any kind: the fallback for a course of assets. */
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

/**
 * Refuses a manifest whose items launch files the package does not contain,
 * so a broken export fails at import with the item and file named, instead of
 * a blank page when a learner launches it.
 */
function assertLaunchFilesExist(
  activities: ActivityNodeTree[],
  files: PackageFileIndex,
): void {
  for (const node of activities) {
    if (node.href) {
      const filePath = filePartOf(node.href);
      if (escapesPackage(filePath)) {
        throw notDetected(
          `SCORM item "${node.title}" launches "${filePath}", which is outside the package. Launch paths must stay inside it.`,
        );
      }
      if (!hasFile(files, filePath)) {
        const sameName = files.paths
          .map((path) => normalizePackagePath(path))
          .find((path) => path.toLowerCase() === filePath.toLowerCase());
        throw notDetected(
          sameName
            ? `SCORM item "${node.title}" launches "${filePath}", but the package has "${sameName}", which differs only in letter case. File names are case sensitive.`
            : `SCORM item "${node.title}" launches "${filePath}", which is not in the package.`,
        );
      }
    }
    if (node.children) {
      assertLaunchFilesExist(node.children, files);
    }
  }
}

/** The file part of a launch address: no query, no fragment. */
function filePartOf(href: string): string {
  return href.split(/[?#]/, 1)[0] ?? href;
}

function escapesPackage(filePath: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(filePath) ||
    filePath.split('/').some((segment) => segment === '..')
  );
}

/** True when the package has the file, as written or with %-escapes decoded. */
function hasFile(files: PackageFileIndex, filePath: string): boolean {
  if (files.has(filePath)) {
    return true;
  }
  try {
    return files.has(decodeURIComponent(filePath));
  } catch {
    return false;
  }
}

function metadataFrom(fields: {
  scormType?: string;
  launchData?: string;
  masteryScore?: number;
  maxTimeAllowed?: string;
  timeLimitAction?: string;
}): Record<string, unknown> | undefined {
  const metadata: Record<string, unknown> = {};
  if (fields.scormType) {
    metadata['scormType'] = fields.scormType;
  }
  if (fields.launchData) {
    metadata['launchData'] = fields.launchData;
  }
  if (fields.masteryScore !== undefined) {
    metadata['masteryScore'] = fields.masteryScore;
  }
  if (fields.maxTimeAllowed) {
    metadata['maxTimeAllowed'] = fields.maxTimeAllowed;
  }
  if (fields.timeLimitAction) {
    metadata['timeLimitAction'] = fields.timeLimitAction;
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

/** A number from a child element's text, or `undefined` when absent or not a number. */
function numberOf(element: XmlElement, name: string): number | undefined {
  const text = textOf(element, name);
  if (text === '') {
    return undefined;
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

function schemaVersionOf(manifest: XmlElement): string {
  const metadata = firstChild(manifest, 'metadata');
  return textOf(metadata, 'schemaversion');
}

function detectScormType(schemaversion: string): 'scorm_12' | 'scorm_2004' {
  if (schemaversion.includes('2004') || schemaversion.includes('CAM 1.3')) {
    return 'scorm_2004';
  }
  return 'scorm_12';
}

function notDetected(message: string): LmsError {
  return new LmsError({
    status: httpStatusForLmsCode(PACKAGE_NOT_DETECTED),
    code: PACKAGE_NOT_DETECTED,
    message,
  });
}

function decodeUtf8(bytes: Uint8Array | undefined): string | undefined {
  if (!bytes) {
    return undefined;
  }
  return new TextDecoder().decode(bytes);
}

function parseXml(xml: string): XmlElement {
  const source = xml
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_all, body: string) =>
      escapeXml(body),
    )
    .replace(/<!DOCTYPE[^[>]*(?:\[[\s\S]*?\])?\s*>/gi, '');
  const root: XmlElement = {
    localName: '#root',
    attrs: {},
    text: '',
    children: [],
  };
  const stack: XmlElement[] = [root];
  const tagRe = /<(\/)?([^\s/>]+)([^>]*)>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(source))) {
    const text = source.slice(lastIndex, match.index);
    const current = stack[stack.length - 1];
    if (current && /[^\s]/.test(text)) {
      current.text += decodeXml(text);
    }
    lastIndex = tagRe.lastIndex;

    const isClose = Boolean(match[1]);
    const rawName = match[2] ?? '';
    const rawAttrs = match[3] ?? '';
    if (isClose) {
      if (stack.length > 1) {
        stack.pop();
      }
      continue;
    }

    const selfClosing = /\/\s*$/.test(rawAttrs);
    const element: XmlElement = {
      localName: toLocalName(rawName),
      attrs: parseAttrs(rawAttrs.replace(/\/\s*$/, '')),
      text: '',
      children: [],
    };
    current?.children.push(element);
    if (!selfClosing) {
      stack.push(element);
    }
  }
  return root;
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const name = match[1];
    if (!name || name === '/') {
      continue;
    }
    attrs[name] = decodeXml(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function attr(
  element: XmlElement | undefined,
  name: string,
): string | undefined {
  if (!element) {
    return undefined;
  }
  const want = name.toLowerCase();
  for (const [key, value] of Object.entries(element.attrs)) {
    if (key.toLowerCase() === want || toLocalName(key) === want) {
      return value;
    }
  }
  return undefined;
}

function childrenNamed(
  element: XmlElement | undefined,
  name: string,
): XmlElement[] {
  if (!element) {
    return [];
  }
  const want = name.toLowerCase();
  return element.children.filter((child) => child.localName === want);
}

function firstChild(
  element: XmlElement | undefined,
  name: string,
): XmlElement | undefined {
  return childrenNamed(element, name)[0];
}

function findDescendant(
  element: XmlElement,
  name: string,
): XmlElement | undefined {
  if (element.localName === name.toLowerCase()) {
    return element;
  }
  for (const child of element.children) {
    const found = findDescendant(child, name);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function textOf(element: XmlElement | undefined, name: string): string {
  const child = firstChild(element, name);
  return child?.text.trim() ?? '';
}

function toLocalName(name: string): string {
  const index = name.indexOf(':');
  return (index >= 0 ? name.slice(index + 1) : name).toLowerCase();
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_all, hex: string) =>
      fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_all, decimal: string) =>
      fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/** Escapes text so it can be decoded again once, as CDATA content must be. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fromCodePoint(codePoint: number): string {
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : '';
}
