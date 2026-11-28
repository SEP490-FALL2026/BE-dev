import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { toPersonnelAccessApiException } from '../personnel-access.http-errors';
import { TransferRevocationRefusedError, type TransferRevocationErrorCode } from './transfer-revocation.errors';

const STATUS: Readonly<Record<TransferRevocationErrorCode, HttpStatus>> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  NOT_IN_CHARGE: HttpStatus.FORBIDDEN,
  REVOCATION_NOT_DUE: HttpStatus.CONFLICT,
  NOTHING_TO_REVOKE: HttpStatus.CONFLICT,
};

const MESSAGES: Readonly<Record<TransferRevocationErrorCode, string>> = {
  NOT_FOUND: 'The transfer does not exist.',
  NOT_IN_CHARGE: 'Only an acting IT Admin of the destination department can reopen transfer revocations.',
  REVOCATION_NOT_DUE: 'The grace period has not ended yet or the transfer is already closed.',
  NOTHING_TO_REVOKE: 'There are no open rights left to reopen revocation for.',
};

/** Maps a transfer revocation refusal to an HTTP exception. */
export function toTransferRevocationApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  const refused = toPersonnelAccessApiException(error);
  if (refused) return refused;
  if (!(error instanceof TransferRevocationRefusedError)) return toUnavailableApiException(error) ?? error;

  return new ApiException(STATUS[error.code], {
    code: `DEPARTMENT_TRANSFER.${error.code}`,
    message: MESSAGES[error.code],
  });
}

const example = (code: TransferRevocationErrorCode) =>
  errorExampleOf(toTransferRevocationApiException(new TransferRevocationRefusedError(code)));

export const TRANSFER_REVOCATION_ERROR_EXAMPLES = {
  NOT_FOUND: example('NOT_FOUND'),
  NOT_IN_CHARGE: example('NOT_IN_CHARGE'),
  REVOCATION_NOT_DUE: example('REVOCATION_NOT_DUE'),
  NOTHING_TO_REVOKE: example('NOTHING_TO_REVOKE'),
} as const;
