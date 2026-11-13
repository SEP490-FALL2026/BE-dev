import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { toLicensingApiException } from '../licensing.http-errors';
import { DepartmentSoftwareNoteInvalidError, DepartmentSoftwareNotInCatalogError } from '../public/licensing.errors';
import {
  DepartmentSoftwareAlreadyListedError,
  DepartmentSoftwareEntryNotFoundError,
  DepartmentSoftwareProposalDecidedError,
  DepartmentSoftwareProposalNotFoundError,
  DepartmentSoftwareProposalOpenError,
} from './department-software.errors';

/**
 * Maps the refusals of the routes of the list of software of a department and of its proposals to their codes (`DEPARTMENT_SOFTWARE.*`);
 * the rest (the department that does not exist, the one that is out of scope) goes to the licensing mapper. What the catalog does not offer
 * is a 422 and names every place; a place already listed, an open proposal and a decided one are 409, a place or a proposal that is not there
 * is a 404.
 */
export function toDepartmentSoftwareApiException(error: unknown): unknown {
  if (error instanceof DepartmentSoftwareNotInCatalogError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'DEPARTMENT_SOFTWARE.NOT_IN_CATALOG',
      message: error.message,
      details: { places: error.places.map((place) => ({ ...place })) },
    });
  }
  if (error instanceof DepartmentSoftwareNoteInvalidError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'DEPARTMENT_SOFTWARE.NOTE_INVALID',
      message: error.message,
      details: { reason: error.reason },
    });
  }
  if (error instanceof DepartmentSoftwareAlreadyListedError) {
    return new ApiException(HttpStatus.CONFLICT, {
      code: 'DEPARTMENT_SOFTWARE.ALREADY_LISTED',
      message: error.message,
      details: { places: error.places.map((place) => ({ ...place })) },
    });
  }
  if (error instanceof DepartmentSoftwareEntryNotFoundError) {
    return new ApiException(HttpStatus.NOT_FOUND, {
      code: 'DEPARTMENT_SOFTWARE.ENTRY_NOT_FOUND',
      message: error.message,
      details: { entryIds: [...error.entryIds] },
    });
  }
  if (error instanceof DepartmentSoftwareProposalNotFoundError) {
    return new ApiException(HttpStatus.NOT_FOUND, {
      code: 'DEPARTMENT_SOFTWARE.PROPOSAL_NOT_FOUND',
      message: error.message,
    });
  }
  if (error instanceof DepartmentSoftwareProposalOpenError) {
    return new ApiException(HttpStatus.CONFLICT, {
      code: 'DEPARTMENT_SOFTWARE.PROPOSAL_ALREADY_OPEN',
      message: error.message,
    });
  }
  if (error instanceof DepartmentSoftwareProposalDecidedError) {
    return new ApiException(HttpStatus.CONFLICT, {
      code: 'DEPARTMENT_SOFTWARE.PROPOSAL_NOT_PENDING',
      message: error.message,
    });
  }

  return toLicensingApiException(error);
}

const example = (error: Error) => errorExampleOf(toDepartmentSoftwareApiException(error));
// Short placeholders: an example never shows an id that looks real (OPENAPI-EXAMPLE.1).
const PLACE = { applicationId: 'application-id', planId: null } as const;

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime. */
export const DEPARTMENT_SOFTWARE_ERROR_EXAMPLES = {
  NOT_IN_CATALOG: example(new DepartmentSoftwareNotInCatalogError([PLACE])),
  ALREADY_LISTED: example(new DepartmentSoftwareAlreadyListedError([PLACE])),
  ENTRY_NOT_FOUND: example(new DepartmentSoftwareEntryNotFoundError(['entry-id'])),
  PROPOSAL_NOT_FOUND: example(new DepartmentSoftwareProposalNotFoundError()),
  PROPOSAL_ALREADY_OPEN: example(new DepartmentSoftwareProposalOpenError()),
  PROPOSAL_NOT_PENDING: example(new DepartmentSoftwareProposalDecidedError()),
} as const;
