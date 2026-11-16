import { withMoneyPath } from './money-path';
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
