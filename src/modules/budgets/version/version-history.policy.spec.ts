import { LINE_DESCRIPTION_MAX, REASON_MAX } from '../budget/budget.policy';
import {
  HISTORY_AFTER_BYTES_MAX,
  HISTORY_CHANGES_MAX,
  HISTORY_CHUNK_BYTES,
  HISTORY_LINES_MAX,
  attachmentAdded,
  attachmentRemoved,
  changesOf,
  chunkSnapshots,
  figureChange,
  lineChange,
  lineSnapshot,
  storedBytesOf,
  type FigureFacts,
  type LineFacts,
} from './version-history.policy';

/** An amount as a reader of the version in VND reads it: whole units, no separator. */
const money = (minor: bigint): string => minor.toString();

const figures: FigureFacts = {
  baseMinor: 60_000_000n,
  reserveMinor: 20_000_000n,
  totalMinor: 80_000_000n,
  quarters: null,
  reserveReason: null,
};

const line: LineFacts = {
  description: 'Figma Organization 10 seats',
  planId: null,
  seats: 10,
  amountMinor: 50_000_000n,
  financeComment: null,
  adjustmentReason: null,
  lineType: 'RENEW',
  zbb: null,
  priorityRank: 1,
};

describe('the figures an edit of a version changed (F66, spec J.4)', () => {
  it('keeps only what changed, as text, and the total the base or the reserve moved', () => {
    const after = { ...figures, reserveMinor: 10_000_000n, totalMinor: 70_000_000n };

    expect(figureChange(figures, after, money)).toEqual({
      before: { reserve: '20000000', total: '80000000' },
      after: { reserve: '10000000', total: '70000000' },
    });
  });

  it('writes the reason of the reserve and the forecast by quarter field by field', () => {
    const after: FigureFacts = {
      ...figures,
      quarters: [20_000_000n, 20_000_000n, 20_000_000n, 20_000_000n],
      reserveReason: 'The plan buys more in the autumn',
    };

    expect(figureChange(figures, after, money)).toEqual({
      before: { q1: null, q2: null, q3: null, q4: null, reserveReason: null },
      after: {
        q1: '20000000',
        q2: '20000000',
        q3: '20000000',
        q4: '20000000',
        reserveReason: 'The plan buys more in the autumn',
      },
    });
  });

  it('shows the reason of the base again when a second change of the base is given with the same reason (QĐ-100v)', () => {
    const before: FigureFacts = { ...figures, baseReason: 'The licences cost more' };
    const after: FigureFacts = { ...before, baseMinor: 55_000_000n, totalMinor: 75_000_000n };

    expect(figureChange(before, after, money)).toEqual({
      before: { base: '60000000', total: '80000000', baseReason: 'The licences cost more' },
      after: { base: '55000000', total: '75000000', baseReason: 'The licences cost more' },
    });
  });

  it('is nothing when the edit gave the values the version already had', () => {
    expect(figureChange(figures, { ...figures }, money)).toBeNull();
  });
});

describe('the fields an edit of a line changed', () => {
  it('names the fields of the line and an amount in the currency of the version', () => {
    const after = {
      ...line,
      amountMinor: 18_000_000n,
      adjustmentReason: 'The price went down',
    };

    expect(lineChange(line, after, money)).toEqual({
      before: { amount: '50000000', adjustmentReason: null },
      after: { amount: '18000000', adjustmentReason: 'The price went down' },
    });
  });

  it('is nothing for a move that left the window where it was', () => {
    expect(lineChange(line, { ...line }, money)).toBeNull();
  });

  it('never shows more fields than one entry of the history shows', () => {
    const everything: LineFacts = {
      description: 'x',
      planId: 'p',
      seats: 1,
      amountMinor: 1n,
      financeComment: 'c',
      adjustmentReason: 'r',
      lineType: 'CANCEL',
      zbb: { purpose: 'p', alternatives: 'a', consequenceIfNot: 'c', usageIndicator: 'u' },
      priorityRank: 2,
    };
    const change = lineChange(line, everything, money);

    expect(Object.keys(change?.after ?? {}).length).toBeLessThanOrEqual(HISTORY_CHANGES_MAX);
    expect(Object.keys(change?.after ?? {})).toHaveLength(9);
  });
});

describe('the lines of an entry that adds or imports', () => {
  it('keeps each line with its position and its values as text', () => {
    expect(lineSnapshot(3, line, money)).toMatchObject({
      position: 3,
      description: 'Figma Organization 10 seats',
      seats: '10',
      amount: '50000000',
      financeComment: null,
    });
  });

  it('cuts a larger file into entries of at most the 200 lines the table keeps, in order', () => {
    const snapshots = Array.from({ length: 450 }, (_, index) => lineSnapshot(index + 1, line, money));
    const chunks = chunkSnapshots(snapshots);

    expect(chunks.map((chunk) => chunk.length)).toEqual([HISTORY_LINES_MAX, HISTORY_LINES_MAX, 50]);
    expect(chunks.flat()).toEqual(snapshots);
    expect(chunkSnapshots([])).toEqual([]);
  });
});

/**
 * The table refuses an `after` whose text is over 262 144 bytes (`budget_version_history_after_size_check`), so the entries are
 * cut by the bytes of the stored text as well as by the number of lines, and a legal edit is never a refusal of the database.
 */
describe('the bytes of the lines of an entry', () => {
  /** The bytes of the text of the array as the table counts them: the brackets, and each line with its separator. */
  const storedBytesOfEntry = (chunk: readonly Record<string, unknown>[]): number =>
    2 + chunk.reduce((sum, snapshot) => sum + storedBytesOf(snapshot) + 2, 0);

  const longest = (overrides: Partial<LineFacts> = {}): LineFacts => ({
    ...line,
    description: 'd'.repeat(LINE_DESCRIPTION_MAX),
    financeComment: 'n'.repeat(REASON_MAX),
    adjustmentReason: 'r'.repeat(REASON_MAX),
    ...overrides,
  });
  const lines = (facts: LineFacts, count = HISTORY_LINES_MAX) =>
    Array.from({ length: count }, (_, index) => lineSnapshot(index + 1, facts, money));

  it('counts at least what PostgreSQL writes for the value: the compact text plus the space after every colon and comma', () => {
    const written = '{"a": "x", "b": null}';

    expect(storedBytesOf({ a: 'x', b: null })).toBeGreaterThanOrEqual(Buffer.byteLength(written));
  });

  it('counts the bytes of the text, not its characters', () => {
    const ascii = storedBytesOf({ description: 'x'.repeat(100) });
    const wide = storedBytesOf({ description: '\u{1F600}'.repeat(50) });

    expect(wide).toBeGreaterThan(ascii);
  });

  it('keeps 200 lines of the longest description and note as several entries, each far enough under what the table keeps', () => {
    const snapshots = lines(longest());

    const chunks = chunkSnapshots(snapshots);

    // Together they are over what one entry may hold; that is the case the cut by count alone left to the database to refuse.
    expect(storedBytesOfEntry(snapshots)).toBeGreaterThan(HISTORY_AFTER_BYTES_MAX);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(HISTORY_LINES_MAX);
      expect(storedBytesOfEntry(chunk)).toBeLessThanOrEqual(HISTORY_CHUNK_BYTES);
      expect(storedBytesOfEntry(chunk)).toBeLessThan(HISTORY_AFTER_BYTES_MAX);
    }
    expect(chunks.flat()).toEqual(snapshots);
  });

  it('keeps the same with the longest text made of four-byte characters, which is the largest a line can be', () => {
    const wide = '\u{1F600}'.repeat(LINE_DESCRIPTION_MAX / 2);
    const snapshots = lines(
      longest({ description: wide, financeComment: wide.repeat(5), adjustmentReason: wide.repeat(5) }),
    );

    const chunks = chunkSnapshots(snapshots);

    for (const chunk of chunks) expect(storedBytesOfEntry(chunk)).toBeLessThan(HISTORY_AFTER_BYTES_MAX);
    expect(chunks.flat()).toEqual(snapshots);
  });

  it('leaves lines of an ordinary size to the cut by count', () => {
    const chunks = chunkSnapshots(lines(line, 450));

    expect(chunks.map((chunk) => chunk.length)).toEqual([HISTORY_LINES_MAX, HISTORY_LINES_MAX, 50]);
  });

  it('never splits a line and never leaves one out: a line over the limit by itself is an entry of its own', () => {
    const snapshots = lines(longest(), 3);

    const chunks = chunkSnapshots(snapshots, { bytes: 10 });

    expect(chunks.map((chunk) => chunk.length)).toEqual([1, 1, 1]);
    expect(chunks.flat()).toEqual(snapshots);
  });
});

describe('the fields as the reader gets them', () => {
  it('puts the figures first, then the fields of a line, whatever order the database kept the keys in', () => {
    const before = { reason: null, total: '80', base: '60' };
    const after = { reason: 'why', total: '70', base: '50', amount: '1', description: 'd' };

    expect(changesOf(before, after).map((change) => change.field)).toEqual([
      'base',
      'total',
      'reason',
      'description',
      'amount',
    ]);
    expect(changesOf(before, after)[0]).toEqual({ field: 'base', before: '60', after: '50' });
  });

  it('shows a field that was not there before as nothing, and never more than the entry can hold', () => {
    const wide = Object.fromEntries(
      Array.from({ length: 30 }, (_, index) => [`f${String(index).padStart(2, '0')}`, 'x']),
    );

    expect(changesOf(null, { base: '1' })).toEqual([{ field: 'base', before: null, after: '1' }]);
    expect(changesOf({}, wide)).toHaveLength(HISTORY_CHANGES_MAX);
  });
});

describe('attachmentAdded and attachmentRemoved history changes', () => {
  it('formats attachmentAdded with all string values and null before', () => {
    const entry = attachmentAdded({
      attachmentId: 'att-1',
      fileName: 'bao-gia.pdf',
      contentType: 'application/pdf',
      sizeBytes: 48213,
    });

    expect(entry.before).toBeNull();
    expect(entry.after).toEqual({
      attachmentId: 'att-1',
      fileName: 'bao-gia.pdf',
      contentType: 'application/pdf',
      sizeBytes: '48213',
    });

    const changes = changesOf(entry.before, entry.after);
    expect(changes.map((c) => c.field)).toEqual(['fileName', 'contentType', 'sizeBytes', 'attachmentId']);
    expect(changes.find((c) => c.field === 'fileName')).toEqual({
      field: 'fileName',
      before: null,
      after: 'bao-gia.pdf',
    });
    expect(changes.find((c) => c.field === 'sizeBytes')).toEqual({
      field: 'sizeBytes',
      before: null,
      after: '48213',
    });
  });

  it('formats attachmentRemoved with string values and state transition', () => {
    const entry = attachmentRemoved({
      attachmentId: 'att-1',
      fileName: 'bao-gia.pdf',
      contentType: 'application/pdf',
      sizeBytes: 48213,
    });

    expect(entry.before).toEqual({
      attachmentId: 'att-1',
      fileName: 'bao-gia.pdf',
      contentType: 'application/pdf',
      sizeBytes: '48213',
      state: 'ATTACHED',
    });
    expect(entry.after).toEqual({
      attachmentId: 'att-1',
      fileName: 'bao-gia.pdf',
      state: 'REMOVED',
    });

    const changes = changesOf(entry.before, entry.after);
    expect(changes.map((c) => c.field)).toEqual(['fileName', 'state', 'attachmentId']);
    expect(changes.find((c) => c.field === 'state')).toEqual({
      field: 'state',
      before: 'ATTACHED',
      after: 'REMOVED',
    });
  });
});
