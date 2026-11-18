import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toVendorDictionaryApiException } from './vendor-dictionary.http-errors';
import {
  VendorDomainInvalidError,
  VendorGroupNameTakenError,
  VendorGroupNotFoundError,
  VendorNameInvalidError,
  VendorPatternInvalidError,
  VendorProposalAlreadyResolvedError,
  VendorProposalNotFoundError,
  VendorProposalResolutionInvalidError,
  VendorServiceLineNameTakenError,
  VendorServiceLineNotFoundError,
  VendorTooManyValuesError,
  VendorUpdateEmptyError,
} from './vendor-dictionary.errors';

function answerOf(error: unknown): { status: number; code: string } {
  const mapped = toVendorDictionaryApiException(error);
  expect(mapped).toBeInstanceOf(ApiException);
  const exception = mapped as ApiException;

  return { status: exception.getStatus(), code: (exception.getResponse() as { code: string }).code };
}

describe('toVendorDictionaryApiException', () => {
  it.each([
    [new VendorGroupNotFoundError(), HttpStatus.NOT_FOUND, 'VENDOR_DICTIONARY.GROUP_NOT_FOUND'],
    [new VendorServiceLineNotFoundError(), HttpStatus.NOT_FOUND, 'VENDOR_DICTIONARY.SERVICE_LINE_NOT_FOUND'],
    [new VendorProposalNotFoundError(), HttpStatus.NOT_FOUND, 'VENDOR_DICTIONARY.PROPOSAL_NOT_FOUND'],
    [new VendorGroupNameTakenError(), HttpStatus.CONFLICT, 'VENDOR_DICTIONARY.GROUP_NAME_TAKEN'],
    [new VendorServiceLineNameTakenError(), HttpStatus.CONFLICT, 'VENDOR_DICTIONARY.SERVICE_LINE_NAME_TAKEN'],
    [new VendorProposalAlreadyResolvedError(), HttpStatus.CONFLICT, 'VENDOR_DICTIONARY.PROPOSAL_ALREADY_RESOLVED'],
    [new VendorNameInvalidError(), HttpStatus.UNPROCESSABLE_ENTITY, 'VENDOR_DICTIONARY.NAME_INVALID'],
    [new VendorDomainInvalidError('x'), HttpStatus.UNPROCESSABLE_ENTITY, 'VENDOR_DICTIONARY.DOMAIN_INVALID'],
    [new VendorPatternInvalidError(), HttpStatus.UNPROCESSABLE_ENTITY, 'VENDOR_DICTIONARY.PATTERN_INVALID'],
    [new VendorTooManyValuesError(20), HttpStatus.UNPROCESSABLE_ENTITY, 'VENDOR_DICTIONARY.TOO_MANY_VALUES'],
    [new VendorUpdateEmptyError(), HttpStatus.UNPROCESSABLE_ENTITY, 'VENDOR_DICTIONARY.UPDATE_EMPTY'],
    [
      new VendorProposalResolutionInvalidError(),
      HttpStatus.UNPROCESSABLE_ENTITY,
      'VENDOR_DICTIONARY.PROPOSAL_RESOLUTION_INVALID',
    ],
  ])('answers %p with its own status and code', (error, status, code) => {
    expect(answerOf(error)).toEqual({ status, code });
  });

  it('returns an error it does not know unchanged', () => {
    const other = new Error('boom');

    expect(toVendorDictionaryApiException(other)).toBe(other);
  });
});
