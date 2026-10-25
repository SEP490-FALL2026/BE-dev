import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toMoneyApiException } from '../../../infrastructure/http/errors/money-errors';
import { toAccessRequestApiException } from './access-request.http-errors';
import {
  AssessmentIncompleteError,
  AssessmentInternalByRegistrationError,
  AssessmentQuoteRefusedError,
  AssessmentReferenceNotFoundError,
  AssessmentRefusedError,
  AssessmentUncontrollableError,
  CatalogLinkRefusedError,
  InternalRegistrationRefusedError,
} from './assessment.errors';

const refuse = (
  status: HttpStatus,
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): ApiException => new ApiException(status, { code, message, ...(details ? { details } : {}) });

/** Maps the errors of the proposal and assessment routes; what is not theirs is mapped as a request error. */
export function toAssessmentApiException(error: unknown): unknown {
  if (error instanceof AssessmentRefusedError) {
    return error.reason === 'OWN_REQUEST'
      ? refuse(HttpStatus.FORBIDDEN, 'ACCESS_REQUEST.OWN_REQUEST', error.message)
      : refuse(HttpStatus.CONFLICT, 'ACCESS_REQUEST.NOT_AWAITING_ASSESSMENT', error.message);
  }
  if (error instanceof AssessmentIncompleteError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'ASSESSMENT.INCOMPLETE', error.message, { missing: error.missing });
  }
  if (error instanceof AssessmentInternalByRegistrationError) {
    return refuse(HttpStatus.CONFLICT, 'ASSESSMENT.INTERNAL_COMPLETES_BY_REGISTRATION', error.message);
  }
  if (error instanceof AssessmentUncontrollableError) {
    return refuse(HttpStatus.CONFLICT, 'ASSESSMENT.CONTROL_LEVEL_UNCONTROLLABLE', error.message);
  }
  if (error instanceof AssessmentQuoteRefusedError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, `ASSESSMENT.${error.reason}`, error.message);
  }
  if (error instanceof AssessmentReferenceNotFoundError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'ASSESSMENT.REFERENCE_NOT_FOUND', error.message, {
      field: error.field,
    });
  }
  if (error instanceof CatalogLinkRefusedError) {
    return refuse(
      HttpStatus.CONFLICT,
      error.reason === 'NOT_LINKABLE'
        ? 'ACCESS_REQUEST.CATALOG_LINK_NOT_ALLOWED'
        : 'ACCESS_REQUEST.BUSINESS_OWNER_REQUIRED',
      error.message,
    );
  }
  if (error instanceof InternalRegistrationRefusedError) {
    if (error.reason === 'NOT_INTERNAL') return refuse(HttpStatus.CONFLICT, 'ASSESSMENT.NOT_INTERNAL', error.message);
    // The codes of the catalog's own refusals (`US-04-01`), so a client that knows them reads them here as well.
    return error.reason === 'NAME_TAKEN'
      ? refuse(HttpStatus.CONFLICT, 'APPLICATION.NAME_TAKEN', error.message)
      : refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'APPLICATION.BUSINESS_OWNER_INVALID', error.message);
  }
  const money = toMoneyApiException(error);
  if (money !== error) return money;

  return toAccessRequestApiException(error);
}
