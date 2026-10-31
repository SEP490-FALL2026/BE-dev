import { groundsRefusal, groundsSnapshot, normalizedGrounds } from './personnel-grounds.policy';

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
