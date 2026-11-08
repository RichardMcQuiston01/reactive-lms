/**
 * Readers for the plain-text files of an AICC course: the INI-style `.crs` and
 * the comma-separated `.au`, `.des` and `.cst`.
 */

/** A section of a `.crs` file: its `key=value` pairs and its free text lines. */
export interface IniSection {
  /** Lower-cased key to value. */
  values: Map<string, string>;
  /** Lines that are not `key=value` pairs, such as the course description. */
  text: string[];
}

/**
 * Splits text into lines on any line ending, dropping a leading byte order
 * mark so the first line of a file is read as written.
 *
 * @param source - File text
 */
export function linesOf(source: string): string[] {
  return source.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
}

/**
 * Reads an INI-style file into sections keyed by lower-cased name. Lines
 * before the first section, blank lines, and `;` comments are ignored.
 *
 * @param source - File text
 */
export function parseIni(source: string): Map<string, IniSection> {
  const sections = new Map<string, IniSection>();
  let current: IniSection | undefined;
  for (const raw of linesOf(source)) {
    const line = raw.trim();
    if (line === '' || line.startsWith(';')) {
      continue;
    }
    const heading = /^\[([^\]]*)\]/.exec(line);
    if (heading) {
      current = { values: new Map(), text: [] };
      sections.set((heading[1] ?? '').trim().toLowerCase(), current);
      continue;
    }
    if (!current) {
      continue;
    }
    const equals = line.indexOf('=');
    if (equals > 0) {
      current.values.set(
        line.slice(0, equals).trim().toLowerCase(),
        line.slice(equals + 1).trim(),
      );
    } else {
      current.text.push(line);
    }
  }
  return sections;
}

/** One data row of a CSV file, keyed by lower-cased column name. */
export type CsvRow = Map<string, string>;

/** A CSV file read with its header: the column names and the data rows. */
export interface CsvTable {
  /** Lower-cased column names, in file order. */
  columns: string[];
  rows: CsvRow[];
}

/**
 * Splits one CSV line into fields. A field may be wrapped in double quotes,
 * which may hold commas and doubled quotes; unquoted fields are trimmed.
 *
 * @param line - One line, without its line ending
 */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let index = 0;
  while (index <= line.length) {
    while (line[index] === ' ' || line[index] === '\t') {
      index += 1;
    }
    let field = '';
    if (line[index] === '"') {
      index += 1;
      while (index < line.length) {
        if (line[index] === '"') {
          if (line[index + 1] === '"') {
            field += '"';
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        field += line[index];
        index += 1;
      }
      while (index < line.length && line[index] !== ',') {
        index += 1;
      }
    } else {
      const comma = line.indexOf(',', index);
      const end = comma === -1 ? line.length : comma;
      field = line.slice(index, end).trim();
      index = end;
    }
    fields.push(field);
    if (index >= line.length) {
      break;
    }
    index += 1;
    if (index === line.length) {
      fields.push('');
      break;
    }
  }
  return fields;
}

/**
 * Reads a CSV file whose first non-blank line names the columns. Column names
 * are matched without regard to case. A row with fewer fields than the header
 * gets empty values for the rest; extra fields are ignored.
 *
 * @param source - File text
 */
export function parseCsv(source: string): CsvTable {
  const lines = linesOf(source).filter((line) => line.trim() !== '');
  const header = lines[0];
  if (header === undefined) {
    return { columns: [], rows: [] };
  }
  const columns = splitCsvLine(header).map((name) => name.trim().toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const fields = splitCsvLine(line);
    const row: CsvRow = new Map();
    columns.forEach((column, position) => {
      row.set(column, fields[position] ?? '');
    });
    return row;
  });
  return { columns, rows };
}
