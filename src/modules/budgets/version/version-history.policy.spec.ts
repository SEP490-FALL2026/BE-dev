import {
  HISTORY_CHANGES_MAX,
  attachmentAdded,
  attachmentRemoved,
  changesOf,
  figureChange,
  type FigureFacts,
} from './version-history.policy';

/** An amount as a reader of the version in VND reads it: whole units, no separator. */
const money = (minor: bigint): string => minor.toString();

const figures: FigureFacts = {
  baseMinor: 60_000_000n,
  reserveMinor: 20_000_000n,
  totalMinor: 80_000_000n,
  reserveReason: null,
};

describe('the figures an edit of a version changed (F66, spec J.4)', () => {
  it('keeps only what changed, as text, and the total the base or the reserve moved', () => {
    const after = { ...figures, reserveMinor: 10_000_000n, totalMinor: 70_000_000n };

    expect(figureChange(figures, after, money)).toEqual({
      before: { reserve: '20000000', total: '80000000' },
      after: { reserve: '10000000', total: '70000000' },
    });
  });

  it('writes the reason of the reserve field by field', () => {
    const after: FigureFacts = {
      ...figures,
      reserveReason: 'The plan buys more in the autumn',
    };

    expect(figureChange(figures, after, money)).toEqual({
      before: { reserveReason: null },
      after: { reserveReason: 'The plan buys more in the autumn' },
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
