import { describe, expect, test } from 'bun:test';
import {
  LmsError,
  PACKAGE_NOT_DETECTED,
} from '@richardmcquiston01/reactive-lms-shared';
import { createMemoryFileIndex } from '../../import/package-file-index';
import { parseImsmanifest } from './parse-imsmanifest';

/**
 * Checks the importer against the Content Aggregation Model rules of SCORM
 * 1.2: the IMS Content Packaging 1.1.2 manifest plus ADL's extensions. They
 * are written from the specification, not from ADL's test packages (the
 * official suite has not been run; see docs/SCORM_1_2_CONFORMANCE.md).
 *
 * A rule is enforced when breaking it makes the course unlaunchable or
 * ambiguous; the import is then refused with the item and the problem named.
 * Rules about style or about fields no LMS behaviour depends on are read
 * leniently, and are listed as such in the conformance document.
 */

interface Parts {
  head?: string;
  organizations?: string;
  resources?: string;
  files?: Record<string, string>;
}

const NS = `xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
    xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"`;
const HEAD = `<metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>`;
const ORGS = (items: string, attrs = 'default="O"'): string =>
  `<organizations ${attrs}><organization identifier="O"><title>Course</title>${items}</organization></organizations>`;
const ITEM = (
  id: string,
  ref: string | undefined,
  extra = '',
  children = '',
): string =>
  `<item identifier="${id}"${ref ? ` identifierref="${ref}"` : ''}><title>${id}</title>${extra}${children}</item>`;
const RES = (
  id: string,
  attrs = 'type="webcontent" adlcp:scormtype="sco" href="a.html"',
  inner = '',
): string => `<resource identifier="${id}" ${attrs}>${inner}</resource>`;

function build(parts: Parts = {}): ReturnType<typeof parseImsmanifest> {
  const xml = `<?xml version="1.0"?>
<manifest identifier="M" version="1.0" ${NS}>
  ${parts.head ?? HEAD}
  ${parts.organizations ?? ORGS(ITEM('I', 'R'))}
  <resources>${parts.resources ?? RES('R')}</resources>
</manifest>`;
  return parseImsmanifest(
    createMemoryFileIndex({
      'imsmanifest.xml': xml,
      'a.html': '<html/>',
      'b.html': '<html/>',
      ...parts.files,
    }),
  );
}

function refused(parts: Parts): string {
  try {
    build(parts);
  } catch (error) {
    expect(error).toBeInstanceOf(LmsError);
    expect((error as LmsError).code).toBe(PACKAGE_NOT_DETECTED);
    return (error as LmsError).message;
  }
  throw new Error('Expected the manifest to be refused.');
}

describe('CAM: a conforming manifest', () => {
  test('imports with its items, resources, and launch file', () => {
    const parsed = build();
    expect(parsed.packageType).toBe('scorm_12');
    expect(parsed.entryHref).toBe('a.html');
    expect(parsed.activities[0]?.publisherId).toBe('I');
  });
});

describe('CAM: organizations', () => {
  test('the default organization must exist', () => {
    const message = refused({
      organizations: ORGS(ITEM('I', 'R'), 'default="NOPE"'),
    });
    expect(message).toContain('"NOPE"');
    expect(message).toContain('default organization');
  });

  test('a manifest with no organization is refused', () => {
    expect(
      refused({ organizations: '<organizations default="O"/>' }),
    ).toContain('no organization');
  });

  test('a manifest whose default is omitted uses the only organization', () => {
    expect(
      build({ organizations: ORGS(ITEM('I', 'R'), '') }).activities,
    ).toHaveLength(1);
  });

  test('organization identifiers must be unique', () => {
    const message = refused({
      organizations: `<organizations default="O"><organization identifier="O"><title>A</title>${ITEM('I', 'R')}</organization><organization identifier="O"><title>B</title></organization></organizations>`,
    });
    expect(message).toContain('"O"');
    expect(message).toContain('more than once');
  });
});

describe('CAM: items', () => {
  test('an item must have an identifier', () => {
    const message = refused({
      organizations: ORGS(
        '<item identifierref="R"><title>No id</title></item>',
      ),
    });
    expect(message).toContain('No id');
    expect(message).toContain('identifier');
  });

  test('item identifiers must be unique across the whole tree', () => {
    const message = refused({
      organizations: ORGS(ITEM('I', 'R', '', ITEM('I', 'R2')) + ITEM('J', 'R')),
      resources: RES('R') + RES('R2', undefined),
    });
    expect(message).toContain('"I"');
    expect(message).toContain('more than once');
  });

  test('an item may refer only to a resource the manifest defines', () => {
    const message = refused({ organizations: ORGS(ITEM('I', 'GHOST')) });
    expect(message).toContain('"I"');
    expect(message).toContain('"GHOST"');
    expect(message).toContain('does not define');
  });

  test('a heading item with no resource is fine, and so are nested items', () => {
    const parsed = build({
      organizations: ORGS(ITEM('H', undefined, '', ITEM('I', 'R'))),
    });
    expect(parsed.activities[0]?.children?.[0]?.publisherId).toBe('I');
  });

  test('two items may launch the same resource', () => {
    const parsed = build({
      organizations: ORGS(ITEM('I', 'R') + ITEM('J', 'R')),
    });
    expect(parsed.activities.map((a) => a.href)).toEqual(['a.html', 'a.html']);
  });
});

describe('CAM: resources', () => {
  test('a resource must have an identifier', () => {
    expect(
      refused({
        resources: `${RES('R')}<resource type="webcontent" adlcp:scormtype="sco" href="b.html"/>`,
      }),
    ).toContain('identifier');
  });

  test('resource identifiers must be unique', () => {
    const message = refused({
      resources:
        RES('R') +
        RES('R', 'type="webcontent" adlcp:scormtype="sco" href="b.html"'),
    });
    expect(message).toContain('"R"');
    expect(message).toContain('more than once');
  });

  test('type, when given, must be webcontent', () => {
    const message = refused({
      resources: RES('R', 'type="imsqti" adlcp:scormtype="sco" href="a.html"'),
    });
    expect(message).toContain('"R"');
    expect(message).toContain('webcontent');
  });

  test('scormtype, when given, must be sco or asset', () => {
    const message = refused({
      resources: RES(
        'R',
        'type="webcontent" adlcp:scormtype="lesson" href="a.html"',
      ),
    });
    expect(message).toContain('"R"');
    expect(message).toContain('"lesson"');
  });

  test('scormtype is read without regard to case', () => {
    expect(
      build({
        resources: RES(
          'R',
          'type="webcontent" adlcp:scormtype="SCO" href="a.html"',
        ),
      }).entryHref,
    ).toBe('a.html');
  });

  test('a SCO or asset that an item launches must have an href', () => {
    const message = refused({
      resources: RES('R', 'type="webcontent" adlcp:scormtype="sco"'),
    });
    expect(message).toContain('"R"');
    expect(message).toContain('href');
  });

  test('a resource that is only a dependency target needs no href', () => {
    const parsed = build({
      resources:
        RES(
          'R',
          'type="webcontent" adlcp:scormtype="sco" href="a.html"',
          '<dependency identifierref="LIB"/>',
        ) + RES('LIB', 'type="webcontent" adlcp:scormtype="asset"'),
    });
    expect(parsed.entryHref).toBe('a.html');
  });

  test('a dependency must name a resource the manifest defines', () => {
    const message = refused({
      resources: RES(
        'R',
        'type="webcontent" adlcp:scormtype="sco" href="a.html"',
        '<dependency identifierref="GHOST"/>',
      ),
    });
    expect(message).toContain('"R"');
    expect(message).toContain('"GHOST"');
  });

  test('resources no item launches are allowed', () => {
    expect(
      build({
        resources:
          RES('R') +
          RES(
            'SPARE',
            'type="webcontent" adlcp:scormtype="asset" href="b.html"',
          ),
      }).entryHref,
    ).toBe('a.html');
  });
});

describe('CAM: ADL item extensions', () => {
  const withExtra = (extra: string): Parts => ({
    organizations: ORGS(ITEM('I', 'R', extra)),
  });

  test('masteryscore is a number from 0 to 100', () => {
    const parsed = build(
      withExtra('<adlcp:masteryscore>80</adlcp:masteryscore>'),
    );
    expect(parsed.activities[0]?.metadata?.['masteryScore']).toBe(80);
    expect(
      build(withExtra('<adlcp:masteryscore>0</adlcp:masteryscore>'))
        .activities[0]?.metadata?.['masteryScore'],
    ).toBe(0);
    for (const bad of ['101', '-1', 'eighty', '80%']) {
      const message = refused(
        withExtra(`<adlcp:masteryscore>${bad}</adlcp:masteryscore>`),
      );
      expect(message).toContain('masteryscore');
      expect(message).toContain(`"${bad}"`);
    }
  });

  test('timelimitaction uses the four defined values', () => {
    for (const ok of [
      'exit,message',
      'exit,no message',
      'continue,message',
      'continue,no message',
    ]) {
      expect(
        build(withExtra(`<adlcp:timelimitaction>${ok}</adlcp:timelimitaction>`))
          .activities[0]?.metadata?.['timeLimitAction'],
      ).toBe(ok);
    }
    expect(
      refused(withExtra('<adlcp:timelimitaction>stop</adlcp:timelimitaction>')),
    ).toContain('timelimitaction');
  });

  test('maxtimeallowed is a time span', () => {
    expect(
      build(withExtra('<adlcp:maxtimeallowed>00:30:00</adlcp:maxtimeallowed>'))
        .activities[0]?.metadata?.['maxTimeAllowed'],
    ).toBe('00:30:00');
    expect(
      build(
        withExtra('<adlcp:maxtimeallowed>0001:30:00.50</adlcp:maxtimeallowed>'),
      ).activities[0]?.metadata?.['maxTimeAllowed'],
    ).toBe('0001:30:00.50');
    for (const bad of ['30 minutes', '00:99:00', '1:2']) {
      expect(
        refused(
          withExtra(`<adlcp:maxtimeallowed>${bad}</adlcp:maxtimeallowed>`),
        ),
      ).toContain('maxtimeallowed');
    }
  });

  test('datafromlms is limited to 255 characters', () => {
    expect(
      build(
        withExtra(`<adlcp:datafromlms>${'x'.repeat(255)}</adlcp:datafromlms>`),
      ).activities[0]?.metadata?.['launchData'],
    ).toHaveLength(255);
    expect(
      refused(
        withExtra(`<adlcp:datafromlms>${'x'.repeat(256)}</adlcp:datafromlms>`),
      ),
    ).toContain('datafromlms');
  });
});
