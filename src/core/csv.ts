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
 * One pass over the text, a character at a time: the rows read so far, the row and the cell being built, whether the
 * reader is inside quotes, and the line of the file it is on. Each step returns the index of the last character it used.
 */
class CsvReader {
  private readonly rows: CsvRow[] = [];
  private row: string[] = [];
  private rowStart = 1;
  private cell = '';
  private inQuotes = false;
  private cellWasQuoted = false;
  private line = 1;

  constructor(
    private readonly text: string,
    private readonly separator: string,
    private readonly limits: CsvLimits,
  ) {}

  read(): CsvRow[] {
    for (let index = 0; index < this.text.length; index += 1) {
      index = this.inQuotes ? this.quotedStep(index) : this.plainStep(index);
    }
    if (this.inQuotes) throw new CsvError('UNTERMINATED_QUOTE', this.line);
    if (this.cell !== '' || this.row.length > 0 || this.cellWasQuoted) this.endRow();

    return this.rows;
  }

  /** Inside quotes: a doubled quote is one quote, a single one closes them, anything else (a line break too) is text. */
  private quotedStep(index: number): number {
    const character = this.text[index];
    if (character === '"') {
      if (this.text[index + 1] === '"') {
        this.cell += '"';
        return index + 1;
      }
      this.inQuotes = false;
      return index;
    }
    if (character === '\n') this.line += 1;
    this.cell += character;
    if (this.cell.length > this.limits.maxCellLength + 1) throw new CsvError('CELL_TOO_LONG', this.line);

    return index;
  }

  /** Outside quotes: a quote opens them where the cell is still blank, the separator ends the cell, a line break the row. */
  private plainStep(index: number): number {
    const character = this.text[index];
    if (character === '"') {
      if (this.cell.trim() !== '') throw new CsvError('STRAY_QUOTE', this.line);
      this.inQuotes = true;
      this.cellWasQuoted = true;
      this.cell = '';
    } else if (character === this.separator) {
      this.endCell();
    } else if (character === '\n' || character === '\r') {
      return this.endLine(index);
    } else {
      this.cell += character;
    }

    return index;
  }

  /** A line break ends the row; CR LF is one break. */
  private endLine(index: number): number {
    const last = this.text[index] === '\r' && this.text[index + 1] === '\n' ? index + 1 : index;
    this.endRow();
    this.line += 1;
    this.rowStart = this.line;

    return last;
  }

  private endCell(): void {
    if (this.cell.length > this.limits.maxCellLength) throw new CsvError('CELL_TOO_LONG', this.line);
    this.row.push(this.cellWasQuoted ? this.cell : this.cell.trim());
    this.cell = '';
    this.cellWasQuoted = false;
    if (this.row.length > this.limits.maxColumns) throw new CsvError('TOO_MANY_COLUMNS', this.line);
  }

  private endRow(): void {
    this.endCell();
    if (this.row.some((value) => value !== '')) {
      this.rows.push({ line: this.rowStart, cells: this.row });
      if (this.rows.length > this.limits.maxRows) throw new CsvError('TOO_MANY_ROWS', this.line);
    }
    this.row = [];
  }
}

/**
 * Reads a CSV file (RFC 4180 with quotes and doubled quotes, a line break allowed inside quotes) into rows of text
 * cells. The separator is a comma, a semicolon or a tab, whichever the header uses. Cells are trimmed, rows that are
 * empty are dropped, and a leading byte order mark is ignored. What a cell says is never interpreted: text that
 * reads like an instruction is just text (US-02-01).
 */
export function parseCsvRows(input: string, limits: Partial<CsvLimits> = {}): CsvRow[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  return new CsvReader(text, detectSeparator(text), { ...DEFAULT_LIMITS, ...limits }).read();
}
