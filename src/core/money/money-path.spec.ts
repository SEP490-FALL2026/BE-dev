import { withFlatMoneyField, withMoneyPath } from './money-path';
import {
  CurrencyNotSupportedError,
  MoneyMalformedError,
  MoneyOutOfRangeError,
  MoneyScaleExceededError,
} from './money.errors';

describe('withMoneyPath', () => {
  it.each([
    new MoneyMalformedError(),
    new MoneyScaleExceededError(2),
    new MoneyOutOfRangeError(),
    new CurrencyNotSupportedError('XYZ'),
  ])('says where the amount sat on %p, thrown at once', (error) => {
    expect(() =>
      withMoneyPath('lines.2.amount', () => {
        throw error;
      }),
    ).toThrow(error);
    expect(error.path).toBe('lines.2.amount');
  });

  it('says where the amount sat on a money error rejected later', async () => {
    const error = new MoneyOutOfRangeError();

    await expect(withMoneyPath('unitPrice', () => Promise.reject(error))).rejects.toBe(error);
    expect(error.path).toBe('unitPrice');
  });

  it('returns the value, and passes any other error through untouched', async () => {
    const other = new Error('boom');

    expect(withMoneyPath('unitPrice', () => 5n)).toBe(5n);
    await expect(withMoneyPath('unitPrice', () => Promise.resolve(6n))).resolves.toBe(6n);
    expect(() =>
      withMoneyPath('unitPrice', () => {
        throw other;
      }),
    ).toThrow(other);
    expect(other).not.toHaveProperty('path');
  });
});

describe('withFlatMoneyField', () => {
  it('marks a malformed amount as the text of a flat field, and leaves the others and the value alone (FIX-E-O1)', async () => {
    const malformed = new MoneyMalformedError();
    const outOfRange = new MoneyOutOfRangeError();

    await expect(withFlatMoneyField(() => Promise.reject(malformed))).rejects.toBe(malformed);
    await expect(withFlatMoneyField(() => Promise.reject(outOfRange))).rejects.toBe(outOfRange);
    await expect(withFlatMoneyField(() => Promise.resolve(7n))).resolves.toBe(7n);
    expect(malformed.flat).toBe(true);
    expect(outOfRange).not.toHaveProperty('flat');
    expect(new MoneyMalformedError().flat).toBe(false);
  });
});
