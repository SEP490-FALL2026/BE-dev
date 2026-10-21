import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
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
