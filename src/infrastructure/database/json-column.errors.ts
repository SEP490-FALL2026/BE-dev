/** One thing wrong in a JSON value: where (`chain.0`, `amountMinor`; empty for the whole value) and what kind of wrong. */
export interface JsonColumnIssue {
  path: readonly PropertyKey[];
  code: string;
}

/** How many issues the message names; the rest are counted. */
const ISSUES_IN_MESSAGE = 5;
const PATH_SEGMENT_LIMIT = 40;

const pathOf = (path: readonly PropertyKey[]): string =>
  path.length === 0 ? '(value)' : path.map((segment) => String(segment).slice(0, PATH_SEGMENT_LIMIT)).join('.');

/**
 * A JSON column holds a value that is not the shape its codec (`<name>.json.ts`) describes: a row written by code that is gone, or
 * by hand. It is an infrastructure fault, so it reaches the caller as a 500 through the path of every unknown error, and a log reads
 * where in the value it went wrong. The message names the table, the column, the places and the kind of each fault, never the value:
 * a column can hold a name, an amount or an address.
 */
export class JsonColumnShapeError extends Error {
  readonly issues: readonly { path: string; code: string }[];

  constructor(
    readonly table: string,
    readonly column: string,
    issues: readonly JsonColumnIssue[],
  ) {
    const named = issues.map((issue) => ({ path: pathOf(issue.path), code: issue.code }));
    const shown = named
      .slice(0, ISSUES_IN_MESSAGE)
      .map((issue) => `${issue.path}: ${issue.code}`)
      .join(', ');
    const more = named.length > ISSUES_IN_MESSAGE ? ` and ${named.length - ISSUES_IN_MESSAGE} more` : '';
    super(`The JSON column ${table}.${column} does not have the shape its codec describes (${shown}${more}).`);
    this.name = 'JsonColumnShapeError';
    this.issues = named;
  }
}
