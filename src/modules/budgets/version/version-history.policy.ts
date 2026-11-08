/**
 * What the history of the edits of a version keeps (`QĐ-91d`), as pure decisions: which fields an edit changed,
 * with their values before and after written as text (an amount as a decimal in the currency of the version, a date as
 * `YYYY-MM-DD`, a number as its digits), and the order a reader sees them in. The record is written in the transaction of the
 * edit by `VersionHistoryService`; nothing here reads a database.
 */

/** The most fields one entry of the history shows: the widest edit is a line, which has eleven. */
export const HISTORY_CHANGES_MAX = 16;

/** The fields of an entry of the history as stored: a name and its value as text, or nothing. */
export type HistoryValues = Readonly<Record<string, string | null>>;

export interface HistoryChange {
  before: HistoryValues;
  after: HistoryValues;
}

export interface FigureFacts {
  baseMinor: bigint;
  reserveMinor: bigint;
  totalMinor: bigint;
  quarters: readonly [bigint, bigint, bigint, bigint] | null;
  /** Why the reserve is not the default share of the base. */
  reserveReason: string | null;
  /** Why Finance moved the base (`QĐ-100v`). */
  baseReason?: string | null;
}

export interface LineFacts {
  description: string;
  planId: string | null;
  seats: number | null;
  amountMinor: bigint;
  financeComment: string | null;
  adjustmentReason: string | null;
}

/** The order a reader sees the fields in: the figures, then the line fields; any other name follows, alphabetically. */
const FIELD_ORDER: readonly string[] = [
  'base',
  'reserve',
  'total',
  'q1',
  'q2',
  'q3',
  'q4',
  // An entry written before QĐ-97b can still carry the reason of a revision.
  'reason',
  'reserveReason',
  'baseReason',
  'description',
  'planId',
  'seats',
  'amount',
  'financeComment',
  'adjustmentReason',
  'fileName',
  'contentType',
  'sizeBytes',
  'state',
  'attachmentId',
];

const text = (value: number | null): string | null => (value === null ? null : String(value));

/** Only what an edit changed, with the value before and after; null when it changed nothing. */
function changeOf(
  fields: readonly (readonly [name: string, before: string | null, after: string | null])[],
): HistoryChange | null {
  const changed = fields.filter(([, before, after]) => before !== after);
  if (changed.length === 0) return null;

  return {
    before: Object.fromEntries(changed.map(([name, before]) => [name, before])),
    after: Object.fromEntries(changed.map(([name, , after]) => [name, after])),
  };
}

/** The figures an edit of the version changed (`VersionService.update`); the total is shown when the base or the reserve moved it. */
export function figureChange(
  before: FigureFacts,
  after: FigureFacts,
  money: (minor: bigint) => string,
): HistoryChange | null {
  const amount = (minor: bigint | null) => (minor === null ? null : money(minor));
  const quarter = (facts: FigureFacts, index: 0 | 1 | 2 | 3) => amount(facts.quarters?.[index] ?? null);

  return changeOf([
    ['base', amount(before.baseMinor), amount(after.baseMinor)],
    ['reserve', amount(before.reserveMinor), amount(after.reserveMinor)],
    ['total', amount(before.totalMinor), amount(after.totalMinor)],
    ['q1', quarter(before, 0), quarter(after, 0)],
    ['q2', quarter(before, 1), quarter(after, 1)],
    ['q3', quarter(before, 2), quarter(after, 2)],
    ['q4', quarter(before, 3), quarter(after, 3)],
    ['reserveReason', before.reserveReason, after.reserveReason],
    ['baseReason', before.baseReason ?? null, after.baseReason ?? null],
  ]);
}

/** The fields an edit of one line changed (`VersionLineService.updateLine` and the move of a window). */
export function lineChange(
  before: LineFacts,
  after: LineFacts,
  money: (minor: bigint) => string,
): HistoryChange | null {
  return changeOf([
    ['description', before.description, after.description],
    ['planId', before.planId, after.planId],
    ['seats', text(before.seats), text(after.seats)],
    ['amount', money(before.amountMinor), money(after.amountMinor)],
    ['financeComment', before.financeComment, after.financeComment],
    ['adjustmentReason', before.adjustmentReason, after.adjustmentReason],
  ]);
}

/** A line that was added or imported, as the history keeps it (`LINES_ADDED`, `LINES_IMPORTED`): what is read of it is the range. */
export function lineSnapshot(
  position: number,
  line: LineFacts,
  money: (minor: bigint) => string,
): Record<string, string | number | null> {
  return {
    position,
    description: line.description,
    planId: line.planId,
    seats: text(line.seats),
    amount: money(line.amountMinor),
    financeComment: line.financeComment,
    adjustmentReason: line.adjustmentReason,
  };
}

/** The most lines one entry of the history holds: the table refuses more, so a larger file is kept as several entries. */
export const HISTORY_LINES_MAX = 200;

/** The most bytes the text of the lines of one entry may take: the table refuses an `after` over it (`budget_version_history_after_size_check`). */
export const HISTORY_AFTER_BYTES_MAX = 262_144;

/**
 * What the lines of one entry are cut to, in bytes of their stored text: under what the table accepts, because PostgreSQL writes a JSON
 * value a little longer than its compact form (`storedBytesOf` counts that) and the rest is a margin, so that a line of the longest text
 * the forms accept, two hundred of them, is still recorded as entries one after the other and never as a refusal of the edit.
 */
export const HISTORY_CHUNK_BYTES = 240_000;

/**
 * The bytes the stored text of a flat value takes: its compact JSON in UTF-8 plus the space PostgreSQL writes after every `:` and `,`
 * (`jsonb` text output), counted once for each key (a key more than the commas need, which is on the safe side).
 */
export function storedBytesOf(value: Readonly<Record<string, unknown>>): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8') + 2 * Object.keys(value).length;
}

/**
 * Cuts the lines added or imported into the chunks one entry each holds, in order: at most `HISTORY_LINES_MAX` lines and
 * `HISTORY_CHUNK_BYTES` bytes of stored text in one chunk. A line alone is never split and never left out; the length of the text of a
 * line is bounded by the forms and by the import, so one alone is far under the limit.
 */
export function chunkSnapshots<T extends Readonly<Record<string, unknown>>>(
  snapshots: readonly T[],
  limits: { lines?: number; bytes?: number } = {},
): T[][] {
  const maxLines = limits.lines ?? HISTORY_LINES_MAX;
  const maxBytes = limits.bytes ?? HISTORY_CHUNK_BYTES;
  const chunks: T[][] = [];
  let bytes = 0;
  for (const snapshot of snapshots) {
    // The line and the separator that follows it; the brackets of the array are counted when a chunk starts.
    const size = storedBytesOf(snapshot) + 2;
    const current = chunks[chunks.length - 1];
    if (current === undefined || current.length >= maxLines || bytes + size > maxBytes) {
      chunks.push([snapshot]);
      bytes = 2 + size;
    } else {
      current.push(snapshot);
      bytes += size;
    }
  }

  return chunks;
}

/** The fields of an entry as the reader gets them, in the order of `FIELD_ORDER`, at most `HISTORY_CHANGES_MAX`. */
export function changesOf(
  before: Readonly<Record<string, unknown>> | null,
  after: Readonly<Record<string, unknown>>,
): { field: string; before: string | null; after: string | null }[] {
  const rank = (field: string) => {
    const index = FIELD_ORDER.indexOf(field);

    return index === -1 ? FIELD_ORDER.length : index;
  };
  const value = (source: Readonly<Record<string, unknown>> | null, field: string): string | null => {
    const found = source?.[field];

    return typeof found === 'string' ? found : null;
  };

  return Object.keys(after)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .slice(0, HISTORY_CHANGES_MAX)
    .map((field) => ({ field, before: value(before, field), after: value(after, field) }));
}

export function attachmentAdded(facts: {
  attachmentId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}): { before: null; after: HistoryValues } {
  return {
    before: null,
    after: {
      attachmentId: facts.attachmentId,
      fileName: facts.fileName,
      contentType: facts.contentType,
      sizeBytes: String(facts.sizeBytes),
    },
  };
}

export function attachmentRemoved(facts: {
  attachmentId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}): { before: HistoryValues; after: HistoryValues } {
  return {
    before: {
      attachmentId: facts.attachmentId,
      fileName: facts.fileName,
      contentType: facts.contentType,
      sizeBytes: String(facts.sizeBytes),
      state: 'ATTACHED',
    },
    after: {
      attachmentId: facts.attachmentId,
      fileName: facts.fileName,
      state: 'REMOVED',
    },
  };
}
