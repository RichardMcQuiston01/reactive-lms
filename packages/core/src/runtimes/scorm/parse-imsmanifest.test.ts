import { describe, expect, test } from 'bun:test';
import {
  LmsError,
  PACKAGE_NOT_DETECTED,
} from '@richardmcquiston01/reactive-lms-shared';
import { createMemoryFileIndex } from '../../import/package-file-index';
import { parseImsmanifest } from './parse-imsmanifest';

const IMSMANIFEST_12 = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="MANIFEST-GOLF" version="1.0"
    xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
    xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>Golf Explained</title>
      <item identifier="ITEM-1" identifierref="RES-1">
        <title>Playing the Game</title>
        <adlcp:datafromlms>hole=1</adlcp:datafromlms>
      </item>
      <item identifier="ITEM-2">
        <title>Chapter</title>
        <item identifier="ITEM-2A" identifierref="RES-2">
          <title>Etiquette</title>
        </item>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="webcontent" adlcp:scormtype="sco"
        href="shared/launchpage.html">
      <file href="shared/launchpage.html"/>
    </resource>
    <resource identifier="RES-2" type="webcontent" adlcp:scormtype="sco"
        href="etiquette/etiquette.html">
      <file href="etiquette/etiquette.html"/>
    </resource>
  </resources>
</manifest>
`;

const NAMESPACED = `<?xml version="1.0"?>
<imscp:manifest identifier="M1" version="1.2"
    xmlns:imscp="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
    xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <imscp:metadata>
    <imscp:schemaversion>1.2</imscp:schemaversion>
  </imscp:metadata>
  <imscp:organizations default="ORG">
    <imscp:organization identifier="ORG">
      <imscp:title>Namespaced Course</imscp:title>
      <imscp:item identifier="I1" identifierref="R1">
        <imscp:title>SCO One</imscp:title>
      </imscp:item>
    </imscp:organization>
  </imscp:organizations>
  <imscp:resources>
    <imscp:resource identifier="R1" type="webcontent" adlcp:scormtype="sco"
        href="sco.html"/>
  </imscp:resources>
</imscp:manifest>
`;

describe('parseImsmanifest', () => {
  test('builds an activity tree from organization items and resource hrefs', () => {
    const files = createMemoryFileIndex({
      'imsmanifest.xml': IMSMANIFEST_12,
      'shared/launchpage.html': '<html></html>',
      'etiquette/etiquette.html': '<html></html>',
    });
    const parsed = parseImsmanifest(files);

    expect(parsed.packageType).toBe('scorm_12');
    expect(parsed.title).toBe('Golf Explained');
    expect(parsed.version).toBe('1.2');
    expect(parsed.entryHref).toBe('shared/launchpage.html');
    expect(parsed.activities).toEqual([
      {
        publisherId: 'ITEM-1',
        title: 'Playing the Game',
        href: 'shared/launchpage.html',
        metadata: {
          scormType: 'sco',
          launchData: 'hole=1',
        },
      },
      {
        publisherId: 'ITEM-2',
        title: 'Chapter',
        children: [
          {
            publisherId: 'ITEM-2A',
            title: 'Etiquette',
            href: 'etiquette/etiquette.html',
            metadata: { scormType: 'sco' },
          },
        ],
      },
    ]);
  });

  test('uses the first SCO as the default launch node', () => {
    const files = createMemoryFileIndex({
      'imsmanifest.xml': IMSMANIFEST_12,
      'shared/launchpage.html': '<html></html>',
      'etiquette/etiquette.html': '<html></html>',
    });
    const parsed = parseImsmanifest(files);
    expect(parsed.entryHref).toBe('shared/launchpage.html');
    expect(parsed.activities[0]?.href).toBe('shared/launchpage.html');
  });

  test('reads namespaced imsmanifest tags and attributes', () => {
    const files = createMemoryFileIndex({
      'imsmanifest.xml': NAMESPACED,
      'sco.html': '<html></html>',
    });
    const parsed = parseImsmanifest(files);
    expect(parsed.title).toBe('Namespaced Course');
    expect(parsed.entryHref).toBe('sco.html');
    expect(parsed.activities).toEqual([
      {
        publisherId: 'I1',
        title: 'SCO One',
        href: 'sco.html',
        metadata: { scormType: 'sco' },
      },
    ]);
  });

  test('selects the default organization when several exist', () => {
    const files = createMemoryFileIndex({
      'imsmanifest.xml': `<?xml version="1.0"?>
<manifest>
  <organizations default="ORG-B">
    <organization identifier="ORG-A">
      <title>Ignored</title>
      <item identifier="A" identifierref="RA"><title>A</title></item>
    </organization>
    <organization identifier="ORG-B">
      <title>Chosen</title>
      <item identifier="B" identifierref="RB"><title>B</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RA" href="a.html"/>
    <resource identifier="RB" href="b.html"/>
  </resources>
</manifest>`,
      'b.html': '<html></html>',
    });
    const parsed = parseImsmanifest(files);
    expect(parsed.title).toBe('Chosen');
    expect(parsed.entryHref).toBe('b.html');
    expect(parsed.activities[0]?.title).toBe('B');
  });

  test('throws PACKAGE_NOT_DETECTED when imsmanifest.xml is missing', () => {
    const files = createMemoryFileIndex({ 'readme.txt': 'nope' });
    try {
      parseImsmanifest(files);
      throw new Error('expected parseImsmanifest to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: PACKAGE_NOT_DETECTED,
        status: 400,
      });
    }
  });

  test('throws PACKAGE_NOT_DETECTED when no launchable SCO exists', () => {
    const files = createMemoryFileIndex({
      'imsmanifest.xml': `<?xml version="1.0"?>
<manifest>
  <organizations>
    <organization identifier="ORG">
      <title>Empty</title>
    </organization>
  </organizations>
  <resources/>
</manifest>`,
    });
    try {
      parseImsmanifest(files);
      throw new Error('expected parseImsmanifest to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: PACKAGE_NOT_DETECTED,
        status: 400,
      });
    }
  });
});

const HEAD = `<?xml version="1.0"?>
<manifest identifier="M" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
    xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata><schemaversion>1.2</schemaversion></metadata>`;

/** A one-item course whose resource is `resource`, with `files` in the package. */
function course(
  resource: string,
  files: Record<string, string>,
  item = '<item identifier="I" identifierref="R"><title>Item</title></item>',
  resourcesAttrs = '',
): ReturnType<typeof parseImsmanifest> {
  return parseImsmanifest(
    createMemoryFileIndex({
      'imsmanifest.xml': `${HEAD}
  <organizations default="O"><organization identifier="O"><title>T</title>${item}</organization></organizations>
  <resources${resourcesAttrs}>${resource}</resources>
</manifest>`,
      ...files,
    }),
  );
}

function refusal(attempt: () => unknown): string {
  try {
    attempt();
  } catch (error) {
    expect(error).toBeInstanceOf(LmsError);
    expect((error as LmsError).code).toBe(PACKAGE_NOT_DETECTED);
    return (error as LmsError).message;
  }
  throw new Error('Expected the manifest to be refused.');
}

describe('parseImsmanifest: text and entities', () => {
  test('decodes named and numeric character references in titles', () => {
    const parsed = parseImsmanifest(
      createMemoryFileIndex({
        'imsmanifest.xml': `${HEAD}
  <organizations default="O"><organization identifier="O">
    <title>A &amp; B &#38; C &#x26; D &lt;E&gt; &quot;F&quot; &apos;G&apos;</title>
    <item identifier="I" identifierref="R"><title>Caf&#233;</title></item>
  </organization></organizations>
  <resources><resource identifier="R" adlcp:scormtype="sco" href="a.html"/></resources>
</manifest>`,
        'a.html': '',
      }),
    );

    expect(parsed.title).toBe('A & B & C & D <E> "F" \'G\'');
    expect(parsed.activities[0]?.title).toBe('Café');
  });

  test('CDATA is taken literally, not decoded and not parsed as markup', () => {
    const parsed = course(
      '<resource identifier="R" adlcp:scormtype="sco" href="a.html"/>',
      { 'a.html': '' },
      '<item identifier="I" identifierref="R"><title>Item</title><adlcp:datafromlms><![CDATA[a=1&b=2&amp;c=<x>]]></adlcp:datafromlms></item>',
    );

    expect(parsed.activities[0]?.metadata?.['launchData']).toBe(
      'a=1&b=2&amp;c=<x>',
    );
  });

  test('a character reference that is not a character is dropped, not thrown on', () => {
    const parsed = course(
      '<resource identifier="R" adlcp:scormtype="sco" href="a.html"/>',
      { 'a.html': '' },
      '<item identifier="I" identifierref="R"><title>Bad&#99999999999;Ref</title></item>',
    );

    expect(parsed.activities[0]?.title).toBe('BadRef');
  });
});

describe('parseImsmanifest: choosing the launch file', () => {
  const sco = (id: string, href: string): string =>
    `<resource identifier="${id}" adlcp:scormtype="sco" href="${href}"/>`;
  const asset = (id: string, href: string): string =>
    `<resource identifier="${id}" adlcp:scormtype="asset" href="${href}"/>`;
  const items = [
    '<item identifier="A" identifierref="RA"><title>Asset</title></item>',
    '<item identifier="B" identifierref="RB"><title>Sco</title></item>',
  ].join('');

  test('prefers the first SCO over an asset that comes earlier', () => {
    const parsed = course(
      `${asset('RA', 'intro.html')}${sco('RB', 'lesson.html')}`,
      { 'intro.html': '', 'lesson.html': '' },
      items,
    );

    expect(parsed.entryHref).toBe('lesson.html');
  });

  test('falls back to the first asset when the course has no SCO', () => {
    const parsed = course(
      `${asset('RA', 'intro.html')}${asset('RB', 'other.html')}`,
      { 'intro.html': '', 'other.html': '' },
      items,
    );

    expect(parsed.entryHref).toBe('intro.html');
  });

  test('a SCO type written in capitals counts as a SCO', () => {
    const parsed = course(
      `${asset('RA', 'intro.html')}<resource identifier="RB" adlcp:scormType="SCO" href="lesson.html"/>`,
      { 'intro.html': '', 'lesson.html': '' },
      items,
    );

    expect(parsed.entryHref).toBe('lesson.html');
    expect(parsed.activities[1]?.metadata?.['scormType']).toBe('sco');
  });
});

describe('parseImsmanifest: xml:base', () => {
  const resource = (base: string, href: string): string =>
    `<resource identifier="R" adlcp:scormtype="sco"${base} href="${href}"/>`;

  test('joins the bases of the resources group and the resource', () => {
    const parsed = course(
      resource(' xml:base="v2"', 'a.html'),
      { 'content/v2/a.html': '' },
      undefined,
      ' xml:base="content"',
    );

    expect(parsed.entryHref).toBe('content/v2/a.html');
  });

  test('applies the manifest base too', () => {
    const parsed = parseImsmanifest(
      createMemoryFileIndex({
        'imsmanifest.xml': `<manifest xml:base="pkg/" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
    xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2">
  <metadata><schemaversion>1.2</schemaversion></metadata>
  <organizations default="O"><organization identifier="O"><title>T</title>
    <item identifier="I" identifierref="R"><title>Item</title></item></organization></organizations>
  <resources><resource identifier="R" adlcp:scormtype="sco" href="a.html"/></resources>
</manifest>`,
        'pkg/a.html': '',
      }),
    );

    expect(parsed.entryHref).toBe('pkg/a.html');
  });

  test('a base with backslashes or a leading ./ still lands in the package', () => {
    const parsed = course(resource(' xml:base=".\\\\sub\\\\"', 'a.html'), {
      'sub/a.html': '',
    });

    expect(parsed.entryHref).toBe('sub/a.html');
  });

  test('a web address in the href is outside the package', () => {
    const message = refusal(() =>
      course(resource('', 'https://example.com/a.html'), {}),
    );

    expect(message).toContain('outside the package');
    expect(message).toContain('https://example.com/a.html');
  });
});

describe('parseImsmanifest: launch parameters', () => {
  const launched = (parameters: string, href: string): string =>
    course(
      `<resource identifier="R" adlcp:scormtype="sco" href="${href}"/>`,
      { 'a.html': '' },
      `<item identifier="I" identifierref="R" parameters="${parameters}"><title>Item</title></item>`,
    ).entryHref;

  test.each([
    ['?a=1', 'a.html', 'a.html?a=1'],
    ['&a=1', 'a.html', 'a.html?a=1'],
    ['?a=1', 'a.html?x=0', 'a.html?x=0&a=1'],
    ['&a=1', 'a.html?x=0', 'a.html?x=0&a=1'],
    ['a=1', 'a.html?x=0', 'a.html?x=0&a=1'],
    ['#top', 'a.html', 'a.html#top'],
    ['', 'a.html?x=0', 'a.html?x=0'],
  ])('parameters %p on %p give %p', (parameters, href, expected) => {
    expect(launched(parameters, href)).toBe(expected);
  });

  test('the file is found by its path, whatever the query or fragment', () => {
    expect(launched('?a=1#top', 'a.html')).toBe('a.html?a=1#top');
  });
});

describe('parseImsmanifest: launch files must be in the package', () => {
  const sco = (href: string): string =>
    `<resource identifier="R" adlcp:scormtype="sco" href="${href}"/>`;

  test('a missing file is named with the item that launches it', () => {
    const message = refusal(() => course(sco('lost.html'), {}));

    expect(message).toBe(
      'SCORM item "Item" launches "lost.html", which is not in the package.',
    );
  });

  test('a file that differs only by case says so', () => {
    const message = refusal(() =>
      course(sco('Lesson.html'), { 'lesson.html': '' }),
    );

    expect(message).toContain('"lesson.html"');
    expect(message).toContain('letter case');
  });

  test('a percent-escaped href finds the file with the real name', () => {
    const parsed = course(sco('my%20lesson.html'), { 'my lesson.html': '' });

    expect(parsed.entryHref).toBe('my%20lesson.html');
  });

  test('a path that climbs out of the package is refused', () => {
    const message = refusal(() => course(sco('a/../../up.html'), {}));

    expect(message).toContain('outside the package');
  });

  test('a nested item is checked too', () => {
    const message = refusal(() =>
      course(
        sco('lost.html'),
        {},
        '<item identifier="C"><title>Chapter</title><item identifier="I" identifierref="R"><title>Deep</title></item></item>',
      ),
    );

    expect(message).toContain('"Deep"');
  });

  test('a resource no item launches is not checked', () => {
    const parsed = course(
      `${sco('a.html')}<resource identifier="X" adlcp:scormtype="asset" href="never-used.html"/>`,
      { 'a.html': '' },
    );

    expect(parsed.entryHref).toBe('a.html');
  });
});
