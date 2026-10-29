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
  href?: string;
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

  const resources = indexResources(resourcesEl);
  const activities = childrenNamed(organization, 'item').map((item) =>
    itemToActivity(item, resources),
  );
  const entryHref = firstScoHref(activities);
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
  const href = resource?.href;
  const childItems = childrenNamed(item, 'item');
  const launchData = textOf(item, 'datafromlms');
  const scormType = attr(item, 'scormtype') ?? resource?.scormType;
  const metadata = metadataFrom({ scormType, launchData });

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
      href: href ? normalizePackagePath(href) : undefined,
      scormType: scormType || undefined,
    });
  }
  return map;
}

function firstScoHref(activities: ActivityNodeTree[]): string | undefined {
  for (const node of activities) {
    if (node.href) {
      return node.href;
    }
    const nested = node.children ? firstScoHref(node.children) : undefined;
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function metadataFrom(fields: {
  scormType?: string;
  launchData?: string;
}): Record<string, unknown> | undefined {
  const metadata: Record<string, unknown> = {};
  if (fields.scormType) {
    metadata.scormType = fields.scormType;
  }
  if (fields.launchData) {
    metadata.launchData = fields.launchData;
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
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
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '');
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
      current.text += text;
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
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}
