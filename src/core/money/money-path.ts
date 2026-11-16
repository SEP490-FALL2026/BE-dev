import {
  CurrencyNotSupportedError,
  MoneyMalformedError,
  MoneyOutOfRangeError,
  MoneyScaleExceededError,
} from './money.errors';

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
