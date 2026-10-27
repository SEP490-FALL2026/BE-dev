import { HttpStatus } from '@nestjs/common';
import {
  CurrencyNotSupportedError,
  MoneyOutOfRangeError,
  MoneyScaleExceededError,
} from '../../../core/money/money.errors';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toMoneyApiException } from '../../../infrastructure/http/errors/money-errors';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  AccessRequestApplicationRetiredError,
  AccessRequestNoDepartmentError,
  AccessRequestNotFoundError,
  AccessRequestPlanNotFoundError,
} from './access-request.errors';
import { FinanceSetupIncompleteError } from '../../organization/organization.errors';
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

const example = (error: Error) => errorExampleOf(toAssessmentApiException(error));
const quote = (reason: ConstructorParameters<typeof AssessmentQuoteRefusedError>[0]) =>
  example(new AssessmentQuoteRefusedError(reason));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const ASSESSMENT_ERROR_EXAMPLES = {
  NOT_FOUND: example(new AccessRequestNotFoundError()),
  NO_DEPARTMENT: example(new AccessRequestNoDepartmentError()),
  FINANCE_SETUP_INCOMPLETE: example(new FinanceSetupIncompleteError('<department-id>')),
  PLAN_NOT_FOUND: example(new AccessRequestPlanNotFoundError()),
  APPLICATION_RETIRED: example(new AccessRequestApplicationRetiredError()),
  OWN_REQUEST: example(new AssessmentRefusedError('OWN_REQUEST')),
  NOT_AWAITING_ASSESSMENT: example(new AssessmentRefusedError('NOT_AWAITING_ASSESSMENT')),
  INCOMPLETE: example(new AssessmentIncompleteError(['quote'])),
  INCOMPLETE_DATA_SENSITIVITY: example(new AssessmentIncompleteError(['dataSensitivity'])),
  INTERNAL_COMPLETES_BY_REGISTRATION: example(new AssessmentInternalByRegistrationError()),
  CONTROL_LEVEL_UNCONTROLLABLE: example(new AssessmentUncontrollableError()),
  QUOTE_NOT_IN_FORCE: quote('QUOTE_NOT_IN_FORCE'),
  QUOTE_PERIOD_INVALID: quote('QUOTE_PERIOD_INVALID'),
  PAYMENT_FREQUENCY_INVALID: quote('PAYMENT_FREQUENCY_INVALID'),
  AMOUNT_TOO_LARGE: quote('AMOUNT_TOO_LARGE'),
  ALTERNATIVE_PLAN_NOT_FOUND: example(new AssessmentReferenceNotFoundError('alternativePlanId')),
  // One message template whose field varies (details.field names it): the vendor stands for the fields of the save.
  REFERENCE_NOT_FOUND: example(new AssessmentReferenceNotFoundError('vendorId')),
  CATALOG_LINK_NOT_ALLOWED: example(new CatalogLinkRefusedError('NOT_LINKABLE')),
  BUSINESS_OWNER_REQUIRED: example(new CatalogLinkRefusedError('BUSINESS_OWNER_REQUIRED')),
  NOT_INTERNAL: example(new InternalRegistrationRefusedError('NOT_INTERNAL')),
  NAME_TAKEN: example(new InternalRegistrationRefusedError('NAME_TAKEN')),
  BUSINESS_OWNER_INVALID: example(new InternalRegistrationRefusedError('BUSINESS_OWNER_INVALID')),
  MONEY_SCALE_EXCEEDED: example(new MoneyScaleExceededError(2)),
  MONEY_OUT_OF_RANGE: example(new MoneyOutOfRangeError()),
  CURRENCY_NOT_SUPPORTED: example(new CurrencyNotSupportedError('XYZ')),
} as const;
