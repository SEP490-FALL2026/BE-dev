import { ApiException } from '../../infrastructure/http/errors/api.exception';
import { toMoneyApiException } from '../../infrastructure/http/errors/money-errors';
import { toUnavailableApiException } from '../../infrastructure/http/errors/service-unavailable';

/**
 * Maps the errors that every finance route can meet to their HTTP answers. Money errors come from the shared mapper; a database that
 * cannot answer is a 503; anything else is returned unchanged for the global filter.
 */
export function toFinanceApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;

  const money = toMoneyApiException(error);
  if (money !== error) return money;

  return toUnavailableApiException(error) ?? error;
}
