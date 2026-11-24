import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { DocumentAttachRefusedError } from '../../catalog/public/catalog.errors';
import { EmployeeNotStartedError } from '../../organization/public/organization.errors';
import { DeviceAssetCodeExhaustedError } from '../asset-code/asset-code.errors';
import { DeviceNotFoundError, DeviceNotInChargeError } from '../public/devices.errors';
import {
  DeviceAssetCodeTakenError,
  DeviceCollectorAlreadyInstalledError,
  DeviceHandoverDateInvalidError,
  DeviceHandoverWithoutHolderError,
  DeviceHolderNotFoundError,
  DeviceHolderNotWorkingError,
  DevicePlanNotBundledError,
  DeviceRegistrationEndedError,
  DeviceRegistrationNotFoundError,
  DeviceRegistrationOverlapError,
  DeviceSerialTakenError,
  DeviceSignatureNoticeVersionNotFoundError,
} from './registry.errors';

const refuse = (status: HttpStatus, code: string, message: string): ApiException =>
  new ApiException(status, { code, message });

const FORBIDDEN = HttpStatus.FORBIDDEN;
const NOT_FOUND = HttpStatus.NOT_FOUND;
const CONFLICT = HttpStatus.CONFLICT;
const UNPROCESSABLE = HttpStatus.UNPROCESSABLE_ENTITY;

/** Maps the errors of the register routes to their HTTP answers; a database that cannot answer is a 503. */
export function toRegistryApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof DeviceNotInChargeError) return refuse(FORBIDDEN, 'DEVICE.NOT_IN_CHARGE', error.message);
  if (error instanceof DeviceNotFoundError) return refuse(NOT_FOUND, 'DEVICE.NOT_FOUND', error.message);
  if (error instanceof DeviceRegistrationNotFoundError) {
    return refuse(NOT_FOUND, 'DEVICE_REGISTRATION.NOT_FOUND', error.message);
  }
  if (error instanceof DeviceHolderNotFoundError)
    return refuse(UNPROCESSABLE, 'DEVICE.HOLDER_NOT_FOUND', error.message);
  if (error instanceof DeviceHandoverDateInvalidError) {
    return refuse(UNPROCESSABLE, 'DEVICE.HANDOVER_DATE_INVALID', error.message);
  }
  if (error instanceof DeviceHandoverWithoutHolderError) {
    return refuse(UNPROCESSABLE, 'DEVICE.HANDOVER_WITHOUT_HOLDER', error.message);
  }
  if (error instanceof DevicePlanNotBundledError) {
    return refuse(UNPROCESSABLE, 'DEVICE_ACTIVATION.PLAN_NOT_BUNDLED', error.message);
  }
  if (error instanceof DeviceSignatureNoticeVersionNotFoundError) {
    return refuse(UNPROCESSABLE, 'DEVICE_SIGNATURE_RECORD.NOTICE_VERSION_NOT_FOUND', error.message);
  }
  if (error instanceof DeviceHolderNotWorkingError) return refuse(CONFLICT, 'DEVICE.HOLDER_NOT_WORKING', error.message);
  if (error instanceof DeviceAssetCodeTakenError) return refuse(CONFLICT, 'DEVICE.ASSET_CODE_TAKEN', error.message);
  if (error instanceof DeviceAssetCodeExhaustedError) {
    return refuse(CONFLICT, 'DEVICE.ASSET_CODE_EXHAUSTED', error.message);
  }
  if (error instanceof DeviceSerialTakenError) return refuse(CONFLICT, 'DEVICE.SERIAL_TAKEN', error.message);
  if (error instanceof DeviceRegistrationOverlapError) {
    return refuse(CONFLICT, 'DEVICE.REGISTRATION_OVERLAP', error.message);
  }
  if (error instanceof DeviceRegistrationEndedError)
    return refuse(CONFLICT, 'DEVICE_REGISTRATION.ENDED', error.message);
  if (error instanceof DeviceCollectorAlreadyInstalledError) {
    return refuse(CONFLICT, 'DEVICE_REGISTRATION.COLLECTOR_ALREADY_INSTALLED', error.message);
  }
  if (error instanceof EmployeeNotStartedError) {
    return refuse(CONFLICT, 'EMPLOYEE.NOT_STARTED', error.message);
  }

  if (error instanceof DocumentAttachRefusedError) return toDocumentRefusal(error);

  return toUnavailableApiException(error) ?? error;
}

/** The answers the catalog gives for a file that cannot be attached, with the codes the catalog uses for the same refusal. */
function toDocumentRefusal(error: DocumentAttachRefusedError): ApiException {
  switch (error.problem) {
    case 'NOT_FOUND':
      return refuse(NOT_FOUND, 'DOCUMENT.NOT_FOUND', 'The document does not exist.');
    case 'ALREADY_ATTACHED':
      return refuse(CONFLICT, 'DOCUMENT.ALREADY_ATTACHED', 'The document has an owner already.');
    case 'NOT_READY_TO_ATTACH':
      return refuse(CONFLICT, 'DOCUMENT.NOT_READY_TO_ATTACH', 'The document is not uploaded yet.');
    case 'PURPOSE_MISMATCH':
      return refuse(
        UNPROCESSABLE,
        'DOCUMENT.PURPOSE_MISMATCH',
        'The purpose of this document does not fit what it is attached to.',
      );
  }
}

const example = (error: Error) => errorExampleOf(toRegistryApiException(error));

export const REGISTRY_ERROR_EXAMPLES = {
  NOT_IN_CHARGE: example(new DeviceNotInChargeError()),
  DEVICE_NOT_FOUND: example(new DeviceNotFoundError()),
  REGISTRATION_NOT_FOUND: example(new DeviceRegistrationNotFoundError()),
  HOLDER_NOT_FOUND: example(new DeviceHolderNotFoundError()),
  HANDOVER_DATE_INVALID: example(new DeviceHandoverDateInvalidError()),
  HANDOVER_WITHOUT_HOLDER: example(new DeviceHandoverWithoutHolderError()),
  PLAN_NOT_BUNDLED: example(new DevicePlanNotBundledError()),
  NOTICE_VERSION_NOT_FOUND: example(new DeviceSignatureNoticeVersionNotFoundError()),
  HOLDER_NOT_WORKING: example(new DeviceHolderNotWorkingError()),
  ASSET_CODE_TAKEN: example(new DeviceAssetCodeTakenError()),
  ASSET_CODE_EXHAUSTED: example(new DeviceAssetCodeExhaustedError()),
  SERIAL_TAKEN: example(new DeviceSerialTakenError()),
  REGISTRATION_OVERLAP: example(new DeviceRegistrationOverlapError()),
  REGISTRATION_ENDED: example(new DeviceRegistrationEndedError()),
  COLLECTOR_ALREADY_INSTALLED: example(new DeviceCollectorAlreadyInstalledError()),
  DOCUMENT_NOT_FOUND: example(new DocumentAttachRefusedError('NOT_FOUND')),
  DOCUMENT_ALREADY_ATTACHED: example(new DocumentAttachRefusedError('ALREADY_ATTACHED')),
  DOCUMENT_NOT_READY: example(new DocumentAttachRefusedError('NOT_READY_TO_ATTACH')),
  DOCUMENT_PURPOSE_MISMATCH: example(new DocumentAttachRefusedError('PURPOSE_MISMATCH')),
  EMPLOYEE_NOT_STARTED: example(new EmployeeNotStartedError()),
} as const;
