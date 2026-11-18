import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  PlanTermsInstallLimitNumericOnlyForK4Error,
  PlanTermsNotApplicableError,
  PlanTermsPlanNotFoundError,
  PlanTermsReviewDateInFutureError,
  PlanTermsTextInvalidError,
  PlanTermsUrlInvalidError,
} from './plan-terms.errors';

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

const UNPROCESSABLE = HttpStatus.UNPROCESSABLE_ENTITY;

/** Maps the errors of the plan terms routes to their HTTP answers; anything unknown goes on unchanged. */
export function toPlanTermsApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;

  if (error instanceof PlanTermsPlanNotFoundError) return refuse(HttpStatus.NOT_FOUND, 'PLAN.NOT_FOUND', error.message);
  if (error instanceof PlanTermsNotApplicableError)
    return refuse(UNPROCESSABLE, 'PLAN_TERMS.NOT_APPLICABLE', error.message);
  if (error instanceof PlanTermsUrlInvalidError) return refuse(UNPROCESSABLE, 'PLAN_TERMS.URL_INVALID', error.message);
  if (error instanceof PlanTermsTextInvalidError)
    return refuse(UNPROCESSABLE, 'PLAN_TERMS.TEXT_INVALID', error.message);
  if (error instanceof PlanTermsReviewDateInFutureError) {
    return refuse(UNPROCESSABLE, 'PLAN_TERMS.REVIEW_DATE_IN_FUTURE', error.message);
  }
  if (error instanceof PlanTermsInstallLimitNumericOnlyForK4Error) {
    return refuse(UNPROCESSABLE, 'PLAN_TERMS.INSTALL_LIMIT_NUMERIC_ONLY_FOR_K4', error.message);
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toPlanTermsApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime. */
export const PLAN_TERMS_ERROR_EXAMPLES = {
  PLAN_NOT_FOUND: example(new PlanTermsPlanNotFoundError()),
  NOT_APPLICABLE: example(new PlanTermsNotApplicableError()),
  URL_INVALID: example(new PlanTermsUrlInvalidError()),
  TEXT_INVALID: example(new PlanTermsTextInvalidError()),
  REVIEW_DATE_IN_FUTURE: example(new PlanTermsReviewDateInFutureError()),
  INSTALL_LIMIT_NUMERIC_ONLY_FOR_K4: example(new PlanTermsInstallLimitNumericOnlyForK4Error()),
} as const;
