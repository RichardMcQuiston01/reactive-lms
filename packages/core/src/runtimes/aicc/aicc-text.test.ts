import { describe, expect, test } from 'bun:test';
import { linesOf, parseCsv, parseIni, splitCsvLine } from './aicc-text';

describe('splitCsvLine', () => {
  test('splits plain and quoted fields', () => {
    expect(splitCsvLine('a,"b",c')).toEqual(['a', 'b', 'c']);
  });

  test('keeps commas and doubled quotes inside quotes', () => {
    expect(splitCsvLine('"x, y","say ""hi"""')).toEqual(['x, y', 'say "hi"']);
  });

  test('keeps empty fields, including a trailing one', () => {
    expect(splitCsvLine('"a",,"",')).toEqual(['a', '', '', '']);
    expect(splitCsvLine(',')).toEqual(['', '']);
  });

  test('trims unquoted fields and space before a quote', () => {
    expect(splitCsvLine('  a  ,  "b"  ,100 ')).toEqual(['a', 'b', '100']);
  });

  test('reads an empty line as one empty field', () => {
    expect(splitCsvLine('')).toEqual(['']);
  });
});

describe('parseCsv', () => {
  test('matches column names without regard to case', () => {
    const { columns, rows } = parseCsv('"System_ID","Title"\r\n"A1","One"\r\n');
    expect(columns).toEqual(['system_id', 'title']);
    expect(rows[0]?.get('system_id')).toBe('A1');
    expect(rows[0]?.get('title')).toBe('One');
  });

  test('skips blank lines and reads any line ending', () => {
    const { rows } = parseCsv('a,b\n\n1,2\r\r3,4\r\n   \n');
    expect(rows.map((row) => row.get('a'))).toEqual(['1', '3']);
  });

  test('gives empty values for a short row and ignores extra fields', () => {
    const { rows } = parseCsv('a,b,c\n1\n1,2,3,4');
    expect(rows[0]?.get('b')).toBe('');
    expect(rows[0]?.get('c')).toBe('');
    expect(rows[1]?.get('c')).toBe('3');
  });

  test('drops a leading byte order mark', () => {
    const { columns } = parseCsv('\uFEFF"system_id"\n"A1"');
    expect(columns).toEqual(['system_id']);
  });

  test('an empty file has no columns and no rows', () => {
    expect(parseCsv('')).toEqual({ columns: [], rows: [] });
  });
});

describe('parseIni', () => {
  const source = `ignored before any section
[Course]
Course_ID = ID-1
Course_Title=A = B
; a comment
[Course_Description]
First line.
Second line.
`;

  test('reads sections and keys without regard to case', () => {
    const course = parseIni(source).get('course');
    expect(course?.values.get('course_id')).toBe('ID-1');
  });

  test('splits a key at its first equals sign', () => {
    expect(parseIni(source).get('course')?.values.get('course_title')).toBe(
      'A = B',
    );
  });

  test('keeps lines that are not pairs as text, and drops comments', () => {
    const description = parseIni(source).get('course_description');
    expect(description?.text).toEqual(['First line.', 'Second line.']);
    expect(parseIni(source).get('course')?.text).toEqual([]);
  });
});

test('linesOf drops a byte order mark', () => {
  expect(linesOf('\uFEFFa\nb')).toEqual(['a', 'b']);
});
