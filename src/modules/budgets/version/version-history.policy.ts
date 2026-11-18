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
  /** Why the reserve is not the default share of the base. */
  reserveReason: string | null;
  /** Why Finance moved the base (`QĐ-100v`). */
  baseReason?: string | null;
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
  'lineType',
  'priorityRank',
  'zbb',
  'fileName',
  'contentType',
  'sizeBytes',
  'state',
  'attachmentId',
];

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

  const change = changeOf([
    ['base', amount(before.baseMinor), amount(after.baseMinor)],
    ['reserve', amount(before.reserveMinor), amount(after.reserveMinor)],
    ['total', amount(before.totalMinor), amount(after.totalMinor)],
    ['reserveReason', before.reserveReason, after.reserveReason],
    ['baseReason', before.baseReason ?? null, after.baseReason ?? null],
  ]);

  // The same reason given again for a second change of the base is still the reason of that change (`QĐ-100v`).
  if (change && 'base' in change.after && !('baseReason' in change.after) && after.baseReason) {
    return {
      before: { ...change.before, baseReason: before.baseReason ?? null },
      after: { ...change.after, baseReason: after.baseReason },
    };
  }

  return change;
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
