import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  ApplicationAlreadyRetiredError,
  ApplicationBusinessOwnerInvalidError,
  ApplicationDictionaryLineMismatchError,
  ApplicationDictionaryLineNotFoundError,
  ApplicationDictionaryLineTakenError,
  ApplicationDomainInvalidError,
  ApplicationFunctionalGroupInvalidError,
  ApplicationInternalHasNoVendorError,
  ApplicationNameInvalidError,
  ApplicationNameTakenError,
  ApplicationNotFoundError,
  ApplicationNoteInvalidError,
  ApplicationRetirementBlockedError,
  ApplicationRetirementNeedsConfirmationError,
  ApplicationRetirementNotBusinessOwnerError,
  ApplicationRetirementNoteRequiredError,
  ApplicationTooManyDomainsError,
  ApplicationUpdateEmptyError,
  ApplicationVendorGroupChangedError,
  ApplicationVendorNameInvalidError,
  ApplicationVendorRequiredError,
  ApplicationVendorSourceAmbiguousError,
  type RetirementBlockingAssignment,
  type RetirementBlockingSubscription,
} from './application.errors';

const refuse = (status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException =>
  new ApiException(status, { code, message, ...(details ? { details } : {}) });

const UNPROCESSABLE = HttpStatus.UNPROCESSABLE_ENTITY;

/** Maps the errors of the application routes to their HTTP answers; anything unknown goes on unchanged. */
export function toApplicationApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;

  if (error instanceof ApplicationNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'APPLICATION.NOT_FOUND', error.message);
  }
  if (error instanceof ApplicationAlreadyRetiredError) {
    return refuse(HttpStatus.CONFLICT, 'APPLICATION.ALREADY_RETIRED', error.message);
  }
  if (error instanceof ApplicationRetirementBlockedError) {
    return refuse(HttpStatus.CONFLICT, 'APPLICATION.RETIREMENT_BLOCKED', error.message, {
      assignments: error.assignments,
      assignmentTotal: error.assignmentTotal,
      subscriptions: error.subscriptions,
      subscriptionTotal: error.subscriptionTotal,
    });
  }
  if (error instanceof ApplicationRetirementNeedsConfirmationError) {
    return refuse(UNPROCESSABLE, 'APPLICATION.RETIREMENT_NEEDS_CONFIRMATION', error.message);
  }
  if (error instanceof ApplicationRetirementNotBusinessOwnerError) {
    return refuse(UNPROCESSABLE, 'APPLICATION.RETIREMENT_NOT_BUSINESS_OWNER', error.message);
  }
  if (error instanceof ApplicationRetirementNoteRequiredError) {
    return refuse(UNPROCESSABLE, 'APPLICATION.RETIREMENT_NOTE_REQUIRED', error.message);
  }
  if (error instanceof ApplicationNameTakenError) {
    return refuse(HttpStatus.CONFLICT, 'APPLICATION.NAME_TAKEN', error.message);
  }
  if (error instanceof ApplicationDictionaryLineTakenError) {
    return refuse(HttpStatus.CONFLICT, 'APPLICATION.DICTIONARY_LINE_TAKEN', error.message);
  }
  if (error instanceof ApplicationNameInvalidError) {
    return refuse(UNPROCESSABLE, 'APPLICATION.NAME_INVALID', error.message);
  }
  if (error instanceof ApplicationVendorNameInvalidError) {
    return refuse(UNPROCESSABLE, 'APPLICATION.VENDOR_NAME_INVALID', error.message);
  }
  if (error instanceof ApplicationDomainInvalidError) {
    return refuse(UNPROCESSABLE, 'APPLICATION.DOMAIN_INVALID', error.message, { value: error.value });
  }
  if (error instanceof ApplicationTooManyDomainsError) {
    return refuse(UNPROCESSABLE, 'APPLICATION.TOO_MANY_DOMAINS', error.message);
  }
  if (error instanceof ApplicationNoteInvalidError) {
    return refuse(UNPROCESSABLE, 'APPLICATION.NOTE_INVALID', error.message);
  }
  if (error instanceof ApplicationVendorRequiredError) {
    return refuse(UNPROCESSABLE, 'APPLICATION.VENDOR_REQUIRED', error.message);
  }
  if (error instanceof ApplicationVendorSourceAmbiguousError) {
    return refuse(UNPROCESSABLE, 'APPLICATION.VENDOR_SOURCE_AMBIGUOUS', error.message);
  }
  if (error instanceof ApplicationInternalHasNoVendorError) {
    return refuse(UNPROCESSABLE, 'APPLICATION.INTERNAL_HAS_NO_VENDOR', error.message);
  }
  if (error instanceof ApplicationBusinessOwnerInvalidError) {
    return refuse(UNPROCESSABLE, 'APPLICATION.BUSINESS_OWNER_INVALID', error.message);
  }
  if (error instanceof ApplicationFunctionalGroupInvalidError) {
    return refuse(UNPROCESSABLE, 'APPLICATION.FUNCTIONAL_GROUP_INVALID', error.message);
  }
  if (error instanceof ApplicationDictionaryLineNotFoundError) {
    return refuse(UNPROCESSABLE, 'APPLICATION.DICTIONARY_LINE_NOT_FOUND', error.message);
  }
  if (error instanceof ApplicationDictionaryLineMismatchError) {
    return refuse(UNPROCESSABLE, 'APPLICATION.DICTIONARY_LINE_MISMATCH', error.message);
  }
  if (error instanceof ApplicationVendorGroupChangedError) {
    // The race loser of DB-03 (P29-N3): its own code, never the 422 code of a mismatch under a second status.
    return refuse(HttpStatus.CONFLICT, 'APPLICATION.DICTIONARY_GROUP_CHANGED', error.message);
  }
  if (error instanceof ApplicationUpdateEmptyError) {
    return refuse(UNPROCESSABLE, 'APPLICATION.UPDATE_EMPTY', error.message);
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toApplicationApiException(error));

/** What holds an application, as the retirement lists it: the blocker and the names it is enriched with. */
const blockingAssignment: RetirementBlockingAssignment & { employeeCode: string; fullName: string; planName: string } =
  {
    assignmentId: '<assignment-id>',
    employeeId: '<employee-id>',
    planId: '<plan-id>',
    subscriptionId: '<subscription-id>',
    employeeCode: '<employee-code>',
    fullName: '<full-name>',
    planName: '<plan-name>',
  };
const blockingSubscription: RetirementBlockingSubscription & { planName: string } = {
  subscriptionId: '<subscription-id>',
  planId: '<plan-id>',
  endDate: '2026-01-01',
  planName: '<plan-name>',
};

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const APPLICATION_ERROR_EXAMPLES = {
  NOT_FOUND: example(new ApplicationNotFoundError()),
  ALREADY_RETIRED: example(new ApplicationAlreadyRetiredError()),
  RETIREMENT_BLOCKED: example(
    new ApplicationRetirementBlockedError([blockingAssignment], [blockingSubscription], 1, 1),
  ),
  RETIREMENT_NEEDS_CONFIRMATION: example(new ApplicationRetirementNeedsConfirmationError()),
  RETIREMENT_NOT_BUSINESS_OWNER: example(new ApplicationRetirementNotBusinessOwnerError()),
  RETIREMENT_NOTE_REQUIRED: example(new ApplicationRetirementNoteRequiredError()),
  NAME_TAKEN: example(new ApplicationNameTakenError()),
  DICTIONARY_LINE_TAKEN: example(new ApplicationDictionaryLineTakenError()),
  DICTIONARY_GROUP_CHANGED: example(new ApplicationVendorGroupChangedError()),
  NAME_INVALID: example(new ApplicationNameInvalidError()),
  VENDOR_NAME_INVALID: example(new ApplicationVendorNameInvalidError()),
  DOMAIN_INVALID: example(new ApplicationDomainInvalidError('not a host')),
  TOO_MANY_DOMAINS: example(new ApplicationTooManyDomainsError()),
  NOTE_INVALID: example(new ApplicationNoteInvalidError()),
  VENDOR_REQUIRED: example(new ApplicationVendorRequiredError()),
  VENDOR_SOURCE_AMBIGUOUS: example(new ApplicationVendorSourceAmbiguousError()),
  INTERNAL_HAS_NO_VENDOR: example(new ApplicationInternalHasNoVendorError()),
  BUSINESS_OWNER_INVALID: example(new ApplicationBusinessOwnerInvalidError()),
  FUNCTIONAL_GROUP_INVALID: example(new ApplicationFunctionalGroupInvalidError()),
  DICTIONARY_LINE_NOT_FOUND: example(new ApplicationDictionaryLineNotFoundError()),
  DICTIONARY_LINE_MISMATCH: example(new ApplicationDictionaryLineMismatchError()),
  UPDATE_EMPTY: example(new ApplicationUpdateEmptyError()),
} as const;
