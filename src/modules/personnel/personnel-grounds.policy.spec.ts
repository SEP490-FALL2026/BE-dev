import {
  groundsNoteRefusal,
  groundsRefusal,
  groundsSnapshot,
  normalizedGrounds,
  normalizedGroundsNote,
} from './personnel-grounds.policy';

const WHOLE = { type: 'DECISION', reference: 'QD-12/2026', issuer: 'HR Department', issuedOn: '2026-06-20' };

describe('the basis of a personnel change (US-03-01 AC-18)', () => {
  it.each([
    ['nothing is given', undefined],
    ['null is given', null],
    ['every part is empty or blank', { type: '', reference: '  ', issuer: null, issuedOn: undefined }],
  ])('is required when %s', (_name, input) => {
    expect(groundsRefusal(input)).toEqual({ reason: 'GROUNDS_REQUIRED' });
  });

  it.each([
    ['the type', { ...WHOLE, type: ' ' }, ['type']],
    ['the number', { ...WHOLE, reference: undefined }, ['reference']],
    ['the issuer', { ...WHOLE, issuer: '' }, ['issuer']],
    ['the day of issue', { ...WHOLE, issuedOn: null }, ['issuedOn']],
    ['a day of issue that is not a date', { ...WHOLE, issuedOn: '31/06/2026' }, ['issuedOn']],
    ['two parts', { ...WHOLE, type: '', issuer: '' }, ['type', 'issuer']],
  ])('is incomplete without %s, and names what is missing', (_name, input, missing) => {
    expect(groundsRefusal(input)).toEqual({ reason: 'GROUNDS_INCOMPLETE', missing });
  });

  it('refuses the code of a notice as the document, wherever it is written with spaces around', () => {
    expect(groundsRefusal({ ...WHOLE, reference: ' BM09-2026-000123 ' })).toEqual({ reason: 'GROUNDS_IS_NOTICE' });
  });

  it.each(['BM09-2026-12345', 'XBM09-2026-000123', 'BM09-26-000123', 'QD-BM09-2026-000123'])(
    'accepts %s, which is not the form of a notice code',
    (reference) => {
      expect(groundsRefusal({ ...WHOLE, reference })).toBeNull();
    },
  );

  it('accepts a whole basis and keeps it trimmed', () => {
    expect(groundsRefusal(WHOLE)).toBeNull();
    expect(
      normalizedGrounds({
        type: ' DECISION ',
        reference: ' QD-12/2026',
        issuer: 'HR Department ',
        issuedOn: ' 2026-06-20',
      }),
    ).toEqual(WHOLE);
    expect(groundsSnapshot(WHOLE)).toEqual(WHOLE);
  });
});

describe('the basis in one box (QĐ-110a, QĐ-111bd, R-32)', () => {
  it.each([
    ['nothing is given', undefined],
    ['null is given', null],
    ['an empty box', ''],
    ['a blank box', '   \n  '],
  ])('is required when %s', (_name, note) => {
    expect(groundsNoteRefusal(note)).toEqual({ reason: 'GROUNDS_REQUIRED' });
  });

  it('accepts a sentence of 500 characters and refuses one of 501', () => {
    expect(groundsNoteRefusal('a'.repeat(500))).toBeNull();
    expect(groundsNoteRefusal('a'.repeat(501))).toEqual({ reason: 'GROUNDS_TOO_LONG' });
  });

  it('measures the box after trimming, so the spaces around a note are not counted against it', () => {
    expect(groundsNoteRefusal(`  ${'a'.repeat(500)}  `)).toBeNull();
  });

  it('refuses the code of a notice as the document, as the four-part basis does', () => {
    expect(groundsNoteRefusal(' BM09-2026-000123 ')).toEqual({ reason: 'GROUNDS_IS_NOTICE' });
    expect(groundsNoteRefusal('Theo BM09-2026-000123 của trưởng phòng')).toBeNull();
  });

  it('keeps the note trimmed, as the only part of the basis: the others stay empty', () => {
    expect(normalizedGroundsNote('  QĐ nghỉ việc số 12/2026  ')).toEqual({
      type: null,
      reference: 'QĐ nghỉ việc số 12/2026',
      issuer: null,
      issuedOn: null,
    });
  });
});
