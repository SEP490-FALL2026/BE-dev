import { capacityOf, judgeBatch, maskKey, warningOf } from './license-key.policy';

const key = (n: number) => `KEY-${String(n).padStart(4, '0')}-ABCDE-12345`;

describe('the judgement of a batch of keys (US-04-12 AC-1, AC-9)', () => {
  it('keeps every valid key, trimmed, with its line, and reports nothing for them', () => {
    const { rows, errors } = judgeBatch(['  KEY-0001-ABCDE-12345 ', 'abcd1234', 'A_b-c.d=e+f/g1']);

    expect(rows).toEqual([
      { line: 1, key: 'KEY-0001-ABCDE-12345' },
      { line: 2, key: 'abcd1234' },
      { line: 3, key: 'A_b-c.d=e+f/g1' },
    ]);
    expect(errors).toEqual([]);
  });

  it('reports a key of the wrong shape on its line and goes on with the others', () => {
    const { rows, errors } = judgeBatch([
      key(1),
      'short',
      key(2),
      'has a space inside',
      '',
      '   ',
      'x'.repeat(129),
      'café-0001-abcdef',
      key(3),
    ]);

    expect(rows.map((row) => row.line)).toEqual([1, 3, 9]);
    expect(errors).toEqual([
      { line: 2, code: 'INVALID_FORMAT' },
      { line: 4, code: 'INVALID_FORMAT' },
      { line: 5, code: 'INVALID_FORMAT' },
      { line: 6, code: 'INVALID_FORMAT' },
      { line: 7, code: 'INVALID_FORMAT' },
      { line: 8, code: 'INVALID_FORMAT' },
    ]);
  });

  it('takes a key of 8 and of 128 characters and no other length', () => {
    expect(judgeBatch(['x'.repeat(8), 'y'.repeat(128)]).errors).toEqual([]);
    expect(judgeBatch(['x'.repeat(7)]).errors).toEqual([{ line: 1, code: 'INVALID_FORMAT' }]);
  });

  it('keeps the first of a key that appears twice and reports the later one, ignoring spaces around it', () => {
    const { rows, errors } = judgeBatch([key(1), key(2), `  ${key(1)}  `, key(1)]);

    expect(rows.map((row) => row.line)).toEqual([1, 2]);
    expect(errors).toEqual([
      { line: 3, code: 'DUPLICATE_IN_BATCH' },
      { line: 4, code: 'DUPLICATE_IN_BATCH' },
    ]);
  });

  it('tells keys that differ only in case apart, because a license key is case sensitive', () => {
    const { rows, errors } = judgeBatch(['abcdefgh-1234', 'ABCDEFGH-1234']);

    expect(rows).toHaveLength(2);
    expect(errors).toEqual([]);
  });

  it('never repeats a key in a message: an error names a line and a code, nothing else', () => {
    const { errors } = judgeBatch(['bad key with space']);

    expect(JSON.stringify(errors)).not.toContain('bad key');
  });
});

describe('the masked key of a list (US-04-12 AC-2)', () => {
  it('shows only the last four characters', () => {
    expect(maskKey('KEY-0007-ABCDE-12345')).toBe('••••2345');
    expect(maskKey('abcd1234')).toBe('••••1234');
  });

  it('never gives back more of a short key than its tail', () => {
    expect(maskKey('12345678')).toBe('••••5678');
    expect(maskKey('12345678')).not.toContain('1234');
  });
});

describe('the capacity of a purchase (US-04-12 AC-1, AC-12, INV-01)', () => {
  it('is the smaller of the seats bought and the keys that can still be used', () => {
    expect(capacityOf({ purchased: 50, usableKeys: 50 })).toBe(50);
    expect(capacityOf({ purchased: 50, usableKeys: 48 })).toBe(48);
    expect(capacityOf({ purchased: 50, usableKeys: 52 })).toBe(50);
    expect(capacityOf({ purchased: 50, usableKeys: 0 })).toBe(0);
  });

  it('is nothing while the seats bought are not known: INV-01 cannot be judged', () => {
    expect(capacityOf({ purchased: null, usableKeys: 30 })).toBe(0);
  });

  it('warns when the number of keys is not the number bought, and when the number bought is not known', () => {
    expect(warningOf({ purchased: 50, usableKeys: 50 })).toBeNull();
    expect(warningOf({ purchased: 50, usableKeys: 48 })).toBe('KEY_COUNT_DIFFERS');
    expect(warningOf({ purchased: 50, usableKeys: 52 })).toBe('KEY_COUNT_DIFFERS');
    expect(warningOf({ purchased: null, usableKeys: 30 })).toBe('QUANTITY_UNKNOWN');
  });
});
