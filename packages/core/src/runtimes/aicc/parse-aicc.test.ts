import { describe, expect, test } from 'bun:test';
import {
  LmsError,
  PACKAGE_NOT_DETECTED,
  type ActivityNodeTree,
} from '@richardmcquiston01/reactive-lms-shared';
import { createMemoryFileIndex } from '../../import/package-file-index';
import { readAiccFixture } from '../../testing/aicc-fixtures';
import { parseAicc } from './parse-aicc';

const CRS = `[Course]
Course_ID=C1
Course_Title=Course One
Version=3.5
`;
const AU_HEADER =
  '"system_id","type","command_line","max_time_allowed","time_limit_action","file_name","max_score","mastery_score","system_vendor","core_vendor","web_launch","au_password"';
const au = (...rows: string[]): string => [AU_HEADER, ...rows].join('\r\n');
const unit = (id: string, file = 'a.html', rest = ''): string =>
  `"${id}","","","","","${file}",,${rest}`;

interface Parts {
  crs?: string;
  au?: string;
  des?: string | null;
  cst?: string | null;
  files?: Record<string, string>;
}

function build(parts: Parts = {}): ReturnType<typeof parseAicc> {
  const files: Record<string, string> = {
    'course.crs': parts.crs ?? CRS,
    'course.au': parts.au ?? au(unit('A1')),
    'a.html': '<html/>',
    'b.html': '<html/>',
    ...parts.files,
  };
  if (parts.des !== null) {
    files['course.des'] = parts.des ?? '"system_id","title"\r\n"A1","Unit One"';
  }
  if (parts.cst !== null) {
    files['course.cst'] = parts.cst ?? '"block","member"\r\n"ROOT","A1"';
  }
  return parseAicc(createMemoryFileIndex(files));
}

function refused(parts: Parts): string {
  try {
    build(parts);
  } catch (error) {
    expect(error).toBeInstanceOf(LmsError);
    expect((error as LmsError).code).toBe(PACKAGE_NOT_DETECTED);
    return (error as LmsError).message;
  }
  throw new Error('Expected the package to be refused.');
}

const fixture = (name: 'single-au' | 'blocks-and-params') =>
  parseAicc(createMemoryFileIndex(readAiccFixture(name)));

describe('parseAicc: the single-au fixture', () => {
  test('reads the course, its one unit, and what the unit sets', () => {
    const parsed = fixture('single-au');
    expect(parsed).toMatchObject({
      title: 'Single Unit Course',
      version: '3.5',
      entryHref: 'index.html',
      packageType: 'aicc',
    });
    expect(parsed.activities).toEqual([
      {
        publisherId: 'A1',
        title: 'Single Unit Course',
        href: 'index.html',
        metadata: {
          masteryScore: 80,
          maxScore: 100,
          timeLimitAction: 'continue,no message',
        },
      },
    ]);
  });
});

describe('parseAicc: the blocks-and-params fixture', () => {
  const parsed = fixture('blocks-and-params');

  test('reads upper-case file names, a byte order mark, and quoted titles', () => {
    expect(parsed.title).toBe('Safety Basics, Level 1');
    expect(parsed.version).toBe('3.4');
    expect(parsed.entryHref).toBe('units/intro.html');
  });

  test('nests units and blocks as the structure file says', () => {
    const shape = (nodes: ActivityNodeTree[]): unknown[] =>
      nodes.map((node) => [
        node.publisherId,
        node.title,
        node.children ? shape(node.children) : undefined,
      ]);
    expect(shape(parsed.activities)).toEqual([
      ['A1', 'Welcome', undefined],
      [
        'B1',
        'Part 1 "Before"',
        [
          ['A2', 'Lesson 1: Gloves, goggles', undefined],
          ['B2', 'Part 2', [['A3', 'Check your knowledge', undefined]]],
        ],
      ],
    ]);
  });

  test('appends web_launch parameters and keeps spaces in the file name', () => {
    const [, block] = parsed.activities;
    const lesson = block?.children?.[0];
    expect(lesson?.href).toBe('units/Lesson One.html?lang=en');
    const quiz = block?.children?.[1]?.children?.[0];
    expect(quiz?.href).toBe('units/quiz.html?mode=quiz&retry=1');
  });

  test('reads mastery, score, time limit, action, and the data for the unit', () => {
    const lesson = parsed.activities[1]?.children?.[0];
    expect(lesson?.metadata).toEqual({
      masteryScore: 70,
      maxScore: 50,
      maxTimeAllowed: '00:45:00',
      timeLimitAction: 'exit,message',
      launchData: 'stage=2, mode="easy"',
    });
    const intro = parsed.activities[0];
    expect(intro?.metadata).toEqual({ maxScore: 100 });
  });
});

describe('parseAicc: tolerated differences', () => {
  test('without a structure file every unit is at the top level, in order', () => {
    const parsed = build({
      au: au(unit('A1'), unit('A2', 'b.html')),
      cst: null,
    });
    expect(parsed.activities.map((node) => node.publisherId)).toEqual([
      'A1',
      'A2',
    ]);
  });

  test('a unit the structure leaves out follows the placed ones', () => {
    const parsed = build({
      au: au(unit('A1'), unit('A2', 'b.html')),
      cst: '"block","member"\r\n"ROOT","A2"',
    });
    expect(parsed.activities.map((node) => node.publisherId)).toEqual([
      'A2',
      'A1',
    ]);
  });

  test('without a description file the unit title is its id', () => {
    expect(build({ des: null }).activities[0]?.title).toBe('A1');
  });

  test('a course with no title or id is called an AICC package', () => {
    expect(build({ crs: '[Course]\nLevel=1\n' }).title).toBe('AICC package');
  });

  test('ids match without regard to case', () => {
    const parsed = build({ cst: '"block","member"\r\n"root","a1"' });
    expect(parsed.activities[0]?.title).toBe('Unit One');
  });

  test('a time of all zeros means no limit, and an empty one is none', () => {
    const zeros = build({
      au: au('"A1","","","00:00:00","","a.html",,,"","","",""'),
    });
    expect(zeros.activities[0]?.metadata).toBeUndefined();
  });

  test('a time limit action is read without regard to case or spaces', () => {
    const parsed = build({
      au: au('"A1","","","","e, m","a.html",,,"","","",""'),
    });
    expect(parsed.activities[0]?.metadata?.['timeLimitAction']).toBe(
      'exit,message',
    );
  });

  test('a lone course description file is found whatever its base name', () => {
    const parsed = parseAicc(
      createMemoryFileIndex({
        'x.crs': CRS,
        'other.au': au(unit('A1')),
        'a.html': '',
      }),
    );
    expect(parsed.entryHref).toBe('a.html');
  });
});

describe('parseAicc: refusals', () => {
  test('the course file needs a [Course] section', () => {
    expect(refused({ crs: '[Other]\nx=1' })).toContain('[Course]');
  });

  test('a package with no course file is refused', () => {
    expect(() =>
      parseAicc(createMemoryFileIndex({ 'course.au': au(unit('A1')) })),
    ).toThrow('no .crs');
  });

  test('two course files are refused as ambiguous', () => {
    expect(refused({ files: { 'other.crs': CRS } })).toContain('2 .crs files');
  });

  test('several unit files, none named like the course, are refused', () => {
    const message = (() => {
      try {
        parseAicc(
          createMemoryFileIndex({
            'course.crs': CRS,
            'one.au': au(unit('A1')),
            'two.au': au(unit('A2')),
            'a.html': '',
          }),
        );
      } catch (error) {
        return (error as LmsError).message;
      }
      return '';
    })();
    expect(message).toContain('no .au file named like "course.crs"');
  });

  test('the unit file needs system_id and file_name columns', () => {
    expect(refused({ au: '"system_id","title"\r\n"A1","x"' })).toContain(
      '"file_name" column',
    );
    expect(refused({ au: '"file_name"\r\n"a.html"' })).toContain(
      '"system_id" column',
    );
  });

  test('a unit file with no rows is refused', () => {
    expect(refused({ au: AU_HEADER })).toContain('no assignable unit');
  });

  test('a unit needs an id, and ids are unique', () => {
    expect(refused({ au: au(unit('')) })).toContain('no system_id');
    expect(refused({ au: au(unit('A1'), unit('a1', 'b.html')) })).toContain(
      '"a1" more than once',
    );
  });

  test('a unit needs a file to open, and the file must be in the package', () => {
    expect(refused({ au: au(unit('A1', '')) })).toContain('no file_name');
    expect(refused({ au: au(unit('A1', 'gone.html')) })).toContain(
      'AICC unit "A1" launches "gone.html", which is not in the package',
    );
  });

  test('a file that differs only by case says so', () => {
    expect(refused({ au: au(unit('A1', 'A.HTML')) })).toContain(
      'differs only in letter case',
    );
  });

  test('a web address or a path out of the package is refused', () => {
    expect(
      refused({ au: au(unit('A1', 'https://example.com/x.html')) }),
    ).toContain('outside the package');
    expect(refused({ au: au(unit('A1', '../x.html')) })).toContain(
      'outside the package',
    );
  });

  test.each([
    ['mastery_score', '101', 'mastery_score "101"'],
    ['mastery_score', '80%', 'mastery_score "80%"'],
    ['max_score', 'lots', 'max_score "lots"'],
  ])('%s %s is refused', (_column, value, message) => {
    const mastery = _column === 'mastery_score' ? value : '';
    const max = _column === 'max_score' ? value : '';
    expect(
      refused({
        au: au(
          `"A1","","","","","a.html",${max === '' ? '' : `"${max}"`},"${mastery}","","","",""`,
        ),
      }),
    ).toContain(message);
  });

  test('a time and a time limit action must be in AICC form', () => {
    expect(
      refused({ au: au('"A1","","","30 min","","a.html",,,"","","",""') }),
    ).toContain('max_time_allowed "30 min"');
    expect(
      refused({ au: au('"A1","","","","stop","a.html",,,"","","",""') }),
    ).toContain('time_limit_action "stop"');
  });

  test('the structure must have ROOT and name only known members', () => {
    expect(refused({ cst: '"block","member"\r\n"B1","A1"' })).toContain(
      'no ROOT block',
    );
    expect(
      refused({ cst: '"block","member"\r\n"ROOT","A1"\r\n"ROOT","GHOST"' }),
    ).toContain('"GHOST"');
  });

  test('a unit or block can be placed only once', () => {
    expect(
      refused({
        cst: '"block","member"\r\n"ROOT","A1"\r\n"B1","A1"',
      }),
    ).toContain('"A1" more than once');
  });

  test('a block inside itself is refused', () => {
    expect(
      refused({ cst: '"block","member"\r\n"ROOT","ROOT"\r\n"ROOT","A1"' }),
    ).toContain('inside itself');
  });
});
