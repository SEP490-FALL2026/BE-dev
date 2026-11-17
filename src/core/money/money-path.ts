import {
  CurrencyNotSupportedError,
  MoneyMalformedError,
  MoneyOutOfRangeError,
  MoneyScaleExceededError,
} from './money.errors';

/**
 * Runs `read`, a read of an amount that is a field of its own (a flat query `netAmount`, not an object `{ amount, currency }`),
 * and marks a malformed text so the answer points at the field itself (`netAmount`), not at an `amount` inside it. Any
 * other error, and the value, pass through.
 */
export async function withFlatMoneyField<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof MoneyMalformedError) error.flat = true;
    throw error;
  }
}

/**
 * Runs `read` and, when it throws a money error, says where the amount sat in the request body (`unitPrice`,
 * `lines.2.amount`) before throwing it again, so the answer can point the caller at the field. Any other error passes through.
 */
export function withMoneyPath<T>(path: string, read: () => T): T;
export function withMoneyPath<T>(path: string, read: () => Promise<T>): Promise<T>;
export function withMoneyPath<T>(path: string, read: () => T | Promise<T>): T | Promise<T> {
  const attach = (error: unknown): never => {
    if (
      error instanceof MoneyMalformedError ||
      error instanceof MoneyOutOfRangeError ||
      error instanceof MoneyScaleExceededError ||
      error instanceof CurrencyNotSupportedError
    ) {
      error.path = path;
    }
    throw error;
  };
  try {
    const result = read();

    return result instanceof Promise ? result.catch(attach) : result;
  } catch (error) {
    return attach(error);
  }
}
