import { describe, expect, test } from 'bun:test';
import { LmsError, PACKAGE_NOT_DETECTED } from '@reactive-lms/shared';
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
    });
    const parsed = parseImsmanifest(files);
    expect(parsed.entryHref).toBe('shared/launchpage.html');
    expect(parsed.activities[0]?.href).toBe('shared/launchpage.html');
  });

  test('reads namespaced imsmanifest tags and attributes', () => {
    const files = createMemoryFileIndex({
      'imsmanifest.xml': NAMESPACED,
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
