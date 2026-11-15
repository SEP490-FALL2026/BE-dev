import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { AccountNotFoundError } from '../accounts/account.errors';
import { toAccountApiException } from '../accounts/account.http-errors';
import {
  AvatarFileRequiredError,
  AvatarInvalidError,
  AvatarNotSetError,
  AvatarTooLargeError,
  AvatarTypeUnsupportedError,
  WorkPhoneInvalidError,
} from './profile.errors';

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

/** Maps the errors of the profile routes to their HTTP answers; the errors of an account keep their own; a storage or database that cannot answer is a 503. */
export function toProfileApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof AvatarFileRequiredError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'PROFILE.AVATAR_FILE_REQUIRED', error.message);
  }
  if (error instanceof AvatarTooLargeError) {
    return refuse(HttpStatus.PAYLOAD_TOO_LARGE, 'PROFILE.AVATAR_TOO_LARGE', error.message);
  }
  if (error instanceof AvatarTypeUnsupportedError) {
    return refuse(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'PROFILE.AVATAR_TYPE_UNSUPPORTED', error.message);
  }
  if (error instanceof AvatarInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, `PROFILE.AVATAR_${error.reason}`, error.message);
  }
  if (error instanceof WorkPhoneInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'PROFILE.WORK_PHONE_INVALID', error.message);
  }
  if (error instanceof AvatarNotSetError) return refuse(HttpStatus.CONFLICT, 'PROFILE.AVATAR_NOT_SET', error.message);

  return toAccountApiException(error);
}

const example = (error: Error) => errorExampleOf(toProfileApiException(error));

export const PROFILE_ERROR_EXAMPLES = {
  FILE_REQUIRED: example(new AvatarFileRequiredError()),
  TOO_LARGE: example(new AvatarTooLargeError()),
  TYPE_UNSUPPORTED: example(new AvatarTypeUnsupportedError()),
  EMPTY: example(new AvatarInvalidError('EMPTY')),
  TYPE_MISMATCH: example(new AvatarInvalidError('TYPE_MISMATCH')),
  PHONE_INVALID: example(new WorkPhoneInvalidError()),
  NOT_SET: example(new AvatarNotSetError()),
  NOT_FOUND: example(new AccountNotFoundError()),
} as const;
