export type CsvProblem = 'UNTERMINATED_QUOTE' | 'STRAY_QUOTE' | 'TOO_MANY_ROWS' | 'TOO_MANY_COLUMNS' | 'CELL_TOO_LONG';

/** The file cannot be read as a table at all. The reason says why; the position is the row where it went wrong. */
export class CsvError extends Error {
  constructor(
    readonly reason: CsvProblem,
    readonly row?: number,
  ) {
    super(`The file cannot be read: ${reason}${row ? ` at row ${row}` : ''}.`);
    this.name = 'CsvError';
  }
}

export interface CsvLimits {
  /** Rows including the header. */
  maxRows: number;
  maxColumns: number;
  maxCellLength: number;
}

const DEFAULT_LIMITS: CsvLimits = { maxRows: 5001, maxColumns: 40, maxCellLength: 2000 };

/** The separator of the file, taken from its first line outside quotes: whichever of `,` `;` tab comes first. */
function detectSeparator(text: string): string {
  let inQuotes = false;
  for (const character of text) {
    if (character === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (character === ',' || character === ';' || character === '\t')) return character;
    else if (!inQuotes && (character === '\n' || character === '\r')) break;
  }

  return ',';
}

export interface CsvRow {
  /** The line of the file where the row begins (the header is line 1), so a message can name it. */
  line: number;
  cells: string[];
}

export function parseCsv(input: string, limits: Partial<CsvLimits> = {}): string[][] {
  return parseCsvRows(input, limits).map((row) => row.cells);
}

/**
 * Reads a CSV file (RFC 4180 with quotes and doubled quotes, a line break allowed inside quotes) into rows of text
 * cells. The separator is a comma, a semicolon or a tab, whichever the header uses. Cells are trimmed, rows that are
 * empty are dropped, and a leading byte order mark is ignored. What a cell says is never interpreted: text that
 * reads like an instruction is just text (US-02-01).
 */
export function parseCsvRows(input: string, limits: Partial<CsvLimits> = {}): CsvRow[] {
  const { maxRows, maxColumns, maxCellLength } = { ...DEFAULT_LIMITS, ...limits };
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const separator = detectSeparator(text);
  const rows: CsvRow[] = [];
  let row: string[] = [];
  let rowStart = 1;
  let cell = '';
  let inQuotes = false;
  let cellWasQuoted = false;
  let line = 1;

  const endCell = () => {
    if (cell.length > maxCellLength) throw new CsvError('CELL_TOO_LONG', line);
    row.push(cellWasQuoted ? cell : cell.trim());
    cell = '';
    cellWasQuoted = false;
    if (row.length > maxColumns) throw new CsvError('TOO_MANY_COLUMNS', line);
  };
  const endRow = () => {
    endCell();
    if (row.some((value) => value !== '')) {
      rows.push({ line: rowStart, cells: row });
      if (rows.length > maxRows) throw new CsvError('TOO_MANY_ROWS', line);
    }
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (character === '\n') line += 1;
        cell += character;
        if (cell.length > maxCellLength + 1) throw new CsvError('CELL_TOO_LONG', line);
      }
      continue;
    }
    if (character === '"') {
      if (cell.trim() !== '') throw new CsvError('STRAY_QUOTE', line);
      inQuotes = true;
      cellWasQuoted = true;
      cell = '';
    } else if (character === separator) {
      endCell();
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      endRow();
      line += 1;
      rowStart = line;
    } else {
      cell += character;
    }
  }
  if (inQuotes) throw new CsvError('UNTERMINATED_QUOTE', line);
  if (cell !== '' || row.length > 0 || cellWasQuoted) endRow();

  return rows;
}
