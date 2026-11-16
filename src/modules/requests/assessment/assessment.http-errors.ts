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
  AccessRequestSuperAdminCannotRequestError,
} from '../access-request/access-request.errors';
import { FinanceSetupIncompleteError } from '../../organization/public/organization.errors';
import {
  DepartmentSoftwareNoteInvalidError,
  DepartmentSoftwareNotInCatalogError,
  ToolsDepartmentNotFoundError,
} from '../../licensing/public/licensing.errors';
import { RequestPartyIneligibleError } from '../../identity-access/public/request-party.errors';
import { toAccessRequestApiException } from '../access-request/access-request.http-errors';
import {
  AssessmentFreePlanError,
  AssessmentIncompleteError,
  AssessmentInternalByRegistrationError,
  AssessmentQuoteRefusedError,
  AssessmentReferenceNotFoundError,
  AssessmentRefusedError,
  AssessmentTermNotFitError,
  AssessmentUncontrollableError,
  CatalogLinkApplicationMismatchError,
  CatalogLinkRefusedError,
  InternalRegistrationRefusedError,
  ProposalSoftwareInCatalogError,
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
  if (error instanceof AssessmentFreePlanError) {
    return refuse(HttpStatus.CONFLICT, 'ASSESSMENT.SHORT_PROPOSAL_FREE_PLAN', error.message);
  }
  if (error instanceof AssessmentQuoteRefusedError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, `ASSESSMENT.${error.reason}`, error.message);
  }
  if (error instanceof AssessmentTermNotFitError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'ASSESSMENT.TERM_NOT_FIT_KIND', error.message, {
      provisioningType: error.provisioningType,
      termMonths: error.termMonths,
      maxMonths: error.maxMonths,
      reason: error.reason,
    });
  }
  if (error instanceof AssessmentReferenceNotFoundError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'ASSESSMENT.REFERENCE_NOT_FOUND', error.message, {
      field: error.field,
    });
  }
  if (error instanceof ProposalSoftwareInCatalogError) {
    return refuse(HttpStatus.CONFLICT, 'ACCESS_REQUEST.SOFTWARE_IN_CATALOG', error.message, {
      matchedBy: error.matchedBy,
      existing: {
        applicationId: error.existing.applicationId,
        name: error.existing.name,
        plans: error.existing.plans.map((plan) => ({ ...plan })),
        planTotal: error.existing.planTotal,
      },
    });
  }
  if (error instanceof CatalogLinkApplicationMismatchError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'ACCESS_REQUEST.CATALOG_LINK_APPLICATION_MISMATCH', error.message, {
      expectedApplicationId: error.expectedApplicationId,
    });
  }
  if (error instanceof CatalogLinkRefusedError) {
    return error.reason === 'DEPARTMENT_OUT_OF_SCOPE'
      ? refuse(HttpStatus.FORBIDDEN, 'DEPARTMENT.OUT_OF_SCOPE', error.message)
      : refuse(HttpStatus.CONFLICT, 'ACCESS_REQUEST.CATALOG_LINK_NOT_ALLOWED', error.message);
  }
  // The refusals of the list of software of the department that the link asks to write (`QĐ-111c`): the same codes the routes of that list answer with.
  if (error instanceof DepartmentSoftwareNotInCatalogError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'DEPARTMENT_SOFTWARE.NOT_IN_CATALOG', error.message, {
      places: error.places.map((place) => ({ ...place })),
    });
  }
  if (error instanceof DepartmentSoftwareNoteInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'DEPARTMENT_SOFTWARE.NOTE_INVALID', error.message, {
      reason: error.reason,
    });
  }
  if (error instanceof ToolsDepartmentNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'DEPARTMENT.NOT_FOUND', error.message);
  }
  if (error instanceof InternalRegistrationRefusedError) {
    if (error.reason === 'NOT_INTERNAL') return refuse(HttpStatus.CONFLICT, 'ASSESSMENT.NOT_INTERNAL', error.message);
    // The code of the catalog's own refusal (`US-04-01`), so a client that knows it reads it here as well.
    return refuse(HttpStatus.CONFLICT, 'APPLICATION.NAME_TAKEN', error.message);
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
  REQUEST_PARTY_INELIGIBLE: example(
    new RequestPartyIneligibleError({
      reason: 'SPENDING_APPROVER',
      party: 'REQUESTER',
      employeeIds: ['<employee-id>'],
    }),
  ),
  FINANCE_SETUP_INCOMPLETE: example(new FinanceSetupIncompleteError('<department-id>')),
  SUPER_ADMIN_CANNOT_REQUEST: example(new AccessRequestSuperAdminCannotRequestError()),
  PLAN_NOT_FOUND: example(new AccessRequestPlanNotFoundError()),
  APPLICATION_RETIRED: example(new AccessRequestApplicationRetiredError()),
  OWN_REQUEST: example(new AssessmentRefusedError('OWN_REQUEST')),
  NOT_AWAITING_ASSESSMENT: example(new AssessmentRefusedError('NOT_AWAITING_ASSESSMENT')),
  INCOMPLETE: example(new AssessmentIncompleteError(['quote'])),
  INCOMPLETE_DATA_SENSITIVITY: example(new AssessmentIncompleteError(['dataSensitivity'])),
  INTERNAL_COMPLETES_BY_REGISTRATION: example(new AssessmentInternalByRegistrationError()),
  CONTROL_LEVEL_UNCONTROLLABLE: example(new AssessmentUncontrollableError()),
  SHORT_PROPOSAL_FREE_PLAN: example(new AssessmentFreePlanError()),
  QUOTE_NOT_IN_FORCE: quote('QUOTE_NOT_IN_FORCE'),
  QUOTE_PERIOD_INVALID: quote('QUOTE_PERIOD_INVALID'),
  QUOTE_PRICE_NOT_VND: quote('QUOTE_PRICE_NOT_VND'),
  AMOUNT_TOO_LARGE: quote('AMOUNT_TOO_LARGE'),
  TERM_NOT_FIT_KIND: example(new AssessmentTermNotFitError('TERM_MONTHS_OUT_OF_RANGE', 'K1', 12, 9)),
  ALTERNATIVE_PLAN_NOT_FOUND: example(new AssessmentReferenceNotFoundError('alternativePlanId')),
  // One message template whose field varies (details.field names it): the vendor stands for the fields of the save.
  REFERENCE_NOT_FOUND: example(new AssessmentReferenceNotFoundError('vendorId')),
  CATALOG_LINK_NOT_ALLOWED: example(new CatalogLinkRefusedError('NOT_LINKABLE')),
  CATALOG_LINK_APPLICATION_MISMATCH: example(new CatalogLinkApplicationMismatchError('<application-id>')),
  DEPARTMENT_OUT_OF_SCOPE: example(new CatalogLinkRefusedError('DEPARTMENT_OUT_OF_SCOPE')),
  DEPARTMENT_NOT_FOUND: example(new ToolsDepartmentNotFoundError()),
  DEPARTMENT_SOFTWARE_NOT_IN_CATALOG: example(
    new DepartmentSoftwareNotInCatalogError([{ applicationId: 'application-id', planId: 'plan-id' }]),
  ),
  SOFTWARE_IN_CATALOG: example(
    new ProposalSoftwareInCatalogError(
      {
        applicationId: 'application-id',
        name: 'ChatGPT',
        status: 'APPROVED',
        vendor: null,
        plans: [{ planId: 'plan-id', name: 'Plus', provisioningType: 'K1' }],
        planTotal: 1,
        planNamed: null,
      },
      'NAME',
    ),
  ),
  NOT_INTERNAL: example(new InternalRegistrationRefusedError('NOT_INTERNAL')),
  NAME_TAKEN: example(new InternalRegistrationRefusedError('NAME_TAKEN')),
  MONEY_SCALE_EXCEEDED: example(new MoneyScaleExceededError(2, 'unitPrice')),
  MONEY_OUT_OF_RANGE: example(new MoneyOutOfRangeError('unitPrice')),
  CURRENCY_NOT_SUPPORTED: example(new CurrencyNotSupportedError('XYZ', 'originalPrice')),
} as const;
