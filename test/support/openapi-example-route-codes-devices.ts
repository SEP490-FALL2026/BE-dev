import type { RouteErrorStatus } from './openapi-example-manifest';

/** Part of ROUTE_ERROR_CODES (the register of company machines, the notice and the acknowledgement): see openapi-example-manifest.ts. */
export const ROUTE_ERROR_CODES_DEVICES: Readonly<Record<string, Partial<Record<RouteErrorStatus, readonly string[]>>>> =
  {
    deviceCreate: {
      '403': ['DEVICE.NOT_IN_CHARGE'],
      '409': [
        'DEVICE.ASSET_CODE_EXHAUSTED',
        'DEVICE.ASSET_CODE_TAKEN',
        'DEVICE.HOLDER_NOT_WORKING',
        'DEVICE.REGISTRATION_OVERLAP',
        'DEVICE.SERIAL_TAKEN',
      ],
      '422': [
        'DEVICE.HANDOVER_DATE_INVALID',
        'DEVICE.HANDOVER_WITHOUT_HOLDER',
        'DEVICE.HOLDER_NOT_FOUND',
        'DEVICE_ACTIVATION.PLAN_NOT_BUNDLED',
      ],
    },
    deviceUpdate: {
      '403': ['DEVICE.NOT_IN_CHARGE'],
      '404': ['DEVICE.NOT_FOUND'],
      '409': ['DEVICE.ALREADY_RETIRED', 'DEVICE.SERIAL_TAKEN', 'DEVICE.STALE', 'DEVICE.VOIDED'],
      '422': ['DEVICE.UPDATE_EMPTY'],
    },
    aiToolStatusSnapshotCreate: {
      '401': ['DEVICE.CREDENTIAL_EXPIRED', 'DEVICE.CREDENTIAL_INVALID', 'DEVICE.CREDENTIAL_REVOKED'],
      '403': [
        'DEVICE.COLLECTION_STOPPED',
        'DEVICE.NOT_ACKNOWLEDGED',
        'DEVICE.TOOL_STATUS_NOT_ACKNOWLEDGED',
        'DEVICE.WRONG_COLLECTOR_KIND',
      ],
    },
    aiUsageBatchCreate: {
      '401': ['DEVICE.CREDENTIAL_EXPIRED', 'DEVICE.CREDENTIAL_INVALID', 'DEVICE.CREDENTIAL_REVOKED'],
      '403': ['DEVICE.COLLECTION_STOPPED', 'DEVICE.NOT_ACKNOWLEDGED', 'DEVICE.WRONG_COLLECTOR_KIND'],
    },
    collectorAllowlistVersionCreate: {
      '409': ['COLLECTOR_ALLOWLIST.UNCHANGED'],
      '422': ['COLLECTOR_ALLOWLIST.APPLICATION_NOT_ELIGIBLE', 'COLLECTOR_ALLOWLIST.APPLICATION_NOT_FOUND'],
    },
    deviceIntakeRejectionList: {
      '404': ['DEVICE.NOT_FOUND'],
    },
    deviceToolStatusList: {
      '404': ['DEVICE.NOT_FOUND'],
    },
    deviceUsageList: {
      '404': ['DEVICE.NOT_FOUND'],
    },
    myDeviceToolStatusList: {
      '404': ['DEVICE.NOT_FOUND'],
    },
    myDeviceUsageList: {
      '404': ['DEVICE.NOT_FOUND'],
    },
    deviceCredentialList: {
      '404': ['DEVICE_REGISTRATION.NOT_FOUND'],
    },
    deviceCredentialRevocationCreate: {
      '404': ['DEVICE_CREDENTIAL.NOT_FOUND'],
      '409': ['DEVICE_CREDENTIAL.ALREADY_REVOKED'],
    },
    deviceEnrollmentCodeCreate: {
      '404': ['DEVICE_REGISTRATION.NOT_FOUND'],
      '409': [
        'DEVICE_REGISTRATION.COLLECTOR_NOT_INSTALLED',
        'DEVICE_REGISTRATION.ENDED',
        'DEVICE_REGISTRATION.SIGNATURE_RECORD_MISSING',
      ],
    },
    deviceRegistrationCollectorEnable: {
      '403': ['DEVICE.NOT_IN_CHARGE'],
      '404': ['DEVICE_REGISTRATION.NOT_FOUND'],
      '409': [
        'DEVICE.HOLDER_NOT_WORKING',
        'DEVICE_REGISTRATION.COLLECTOR_ALREADY_INSTALLED',
        'DEVICE_REGISTRATION.ENDED',
      ],
    },
    deviceEnrollmentCreate: {
      '404': ['DEVICE_ENROLLMENT.CODE_INVALID'],
    },
    deviceGet: {
      '404': ['DEVICE.NOT_FOUND'],
    },
    deviceRegistrationList: {
      '404': ['DEVICE.NOT_FOUND'],
    },
    deviceHolderChange: {
      '403': ['DEVICE.NOT_IN_CHARGE'],
      '404': ['DEVICE.NOT_FOUND'],
      '409': [
        'DEVICE.ALREADY_RETIRED',
        'DEVICE.AWAITING_RETURN',
        'DEVICE.HOLDER_NOT_WORKING',
        'DEVICE.HOLDER_UNCHANGED',
        'DEVICE.NOT_USABLE',
        'DEVICE.REGISTRATION_OVERLAP',
        'DEVICE.VOIDED',
      ],
      '422': ['DEVICE.HOLDER_NOT_FOUND', 'DEVICE.SOFTWARE_REMOVAL_NOTE_REQUIRED', 'DEVICE.SOFTWARE_REMOVAL_REQUIRED'],
    },
    deviceReturn: {
      '403': ['DEVICE.NOT_IN_CHARGE', 'DEVICE_RETURN_TASK.NOT_IN_CHARGE'],
      '404': ['DEVICE.NOT_FOUND'],
      '409': ['DEVICE.ALREADY_RETIRED', 'DEVICE.NOT_HELD', 'DEVICE.VOIDED'],
      '422': ['DEVICE.SOFTWARE_REMOVAL_NOTE_REQUIRED'],
    },
    deviceConditionChange: {
      '403': ['DEVICE.NOT_IN_CHARGE'],
      '404': ['DEVICE.NOT_FOUND'],
      '409': ['DEVICE.ALREADY_RETIRED', 'DEVICE.CONDITION_UNCHANGED', 'DEVICE.VOIDED'],
    },
    deviceRetire: {
      '403': ['DEVICE.NOT_IN_CHARGE'],
      '404': ['DEVICE.NOT_FOUND'],
      '409': ['DEVICE.ALREADY_RETIRED', 'DEVICE.VOIDED'],
    },
    deviceSessionGet: {
      '401': ['DEVICE.CREDENTIAL_EXPIRED', 'DEVICE.CREDENTIAL_INVALID', 'DEVICE.CREDENTIAL_REVOKED'],
    },
    deviceSessionRotationCreate: {
      '401': ['DEVICE.CREDENTIAL_EXPIRED', 'DEVICE.CREDENTIAL_INVALID', 'DEVICE.CREDENTIAL_REVOKED'],
    },
    deviceSignatureRecordCreate: {
      '404': ['DEVICE_REGISTRATION.NOT_FOUND', 'DOCUMENT.NOT_FOUND'],
      '409': ['DEVICE_REGISTRATION.ENDED', 'DOCUMENT.ALREADY_ATTACHED', 'DOCUMENT.NOT_READY_TO_ATTACH'],
      '422': ['DEVICE_SIGNATURE_RECORD.NOTICE_VERSION_NOT_FOUND', 'DOCUMENT.PURPOSE_MISMATCH'],
    },
    monitoringNoticeCurrentGet: {
      '404': ['MONITORING_NOTICE.NOT_PUBLISHED'],
    },
    monitoringNoticeVersionCreate: {
      '422': ['MONITORING_NOTICE.REACKNOWLEDGEMENT_REQUIRED'],
    },
    deviceStopRequestComplete: {
      '403': ['DEVICE_STOP_REQUEST.NOT_IN_CHARGE'],
      '404': ['DEVICE_STOP_REQUEST.NOT_FOUND'],
      '409': ['DEVICE_STOP_REQUEST.NOT_OPEN'],
    },
    myDeviceStopRequestCreate: {
      '404': ['DEVICE_REGISTRATION.NOT_FOUND'],
      '409': ['DEVICE_REGISTRATION.ENDED'],
    },
    myDeviceAcknowledgementCreate: {
      '404': ['DEVICE_REGISTRATION.NOT_FOUND'],
      '409': [
        'DEVICE_ACKNOWLEDGEMENT.ALREADY_ACKNOWLEDGED',
        'DEVICE_ACKNOWLEDGEMENT.COLLECTOR_NOT_INSTALLED',
        'DEVICE_ACKNOWLEDGEMENT.NOTICE_NOT_CURRENT',
        'DEVICE_REGISTRATION.ENDED',
        'DEVICE_REGISTRATION.SIGNATURE_RECORD_MISSING',
      ],
    },
  };
