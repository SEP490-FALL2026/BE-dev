import type { RouteErrorStatus } from './openapi-example-manifest';

/** Part of ROUTE_ERROR_CODES (operationIds a-l): see openapi-example-manifest.ts. */
export const ROUTE_ERROR_CODES_A_TO_L: Readonly<Record<string, Partial<Record<RouteErrorStatus, readonly string[]>>>> =
  {
    appUserCreate: {
      '404': ['ORGANIZATION.EMPLOYEE_NOT_FOUND'],
      '409': [
        'APP_USER.ALREADY_EXISTS_FOR_EMPLOYEE',
        'APP_USER.EMPLOYEE_TERMINATED',
        'APP_USER.FINANCE_ALREADY_ASSIGNED',
        'APP_USER.LOGIN_EMAIL_TAKEN',
      ],
      '422': [
        'APP_USER.LOGIN_EMAIL_INVALID',
        'APP_USER.LOGIN_EMAIL_REQUIRED',
        'APP_USER.ROLE_DERIVED',
        'APP_USER.SUPER_ADMIN_TRANSFER_ONLY',
      ],
    },
    appUserGet: {
      '404': ['APP_USER.NOT_FOUND'],
    },
    appUserGrantRole: {
      '404': ['APP_USER.NOT_FOUND'],
      '409': [
        'APP_USER.FINANCE_ALREADY_ASSIGNED',
        'APP_USER.ROLE_ALREADY_GRANTED',
        'APP_USER.ROLE_COMBINATION_FORBIDDEN',
        'APP_USER.SELF_CHANGE_FORBIDDEN',
      ],
      '422': ['APP_USER.ROLE_DERIVED', 'APP_USER.SUPER_ADMIN_TRANSFER_ONLY'],
    },
    appUserLock: {
      '404': ['APP_USER.NOT_FOUND'],
      '409': ['APP_USER.SELF_CHANGE_FORBIDDEN', 'APP_USER.SUPER_ADMIN_HOLDER_NOT_LOCKABLE'],
    },
    appUserResendInvitation: {
      '404': ['APP_USER.NOT_FOUND'],
      '409': [
        'APP_USER.ACCOUNT_LOCKED',
        'APP_USER.ALREADY_ACTIVATED',
        'APP_USER.EMPLOYEE_TERMINATED',
        'APP_USER.SELF_CHANGE_FORBIDDEN',
      ],
    },
    appUserRevokeRole: {
      '404': ['APP_USER.NOT_FOUND', 'APP_USER.ROLE_NOT_GRANTED'],
      '409': ['APP_USER.SELF_CHANGE_FORBIDDEN'],
      '422': ['APP_USER.ROLE_DERIVED', 'APP_USER.SUPER_ADMIN_TRANSFER_ONLY'],
    },
    appUserUnlock: {
      '404': ['APP_USER.NOT_FOUND'],
      '409': ['APP_USER.SELF_CHANGE_FORBIDDEN'],
    },
    applicationBusinessOwnerHistory: {
      '404': ['APPLICATION.NOT_FOUND'],
    },
    applicationCreate: {
      '409': ['APPLICATION.DICTIONARY_GROUP_CHANGED', 'APPLICATION.DICTIONARY_LINE_TAKEN', 'APPLICATION.NAME_TAKEN'],
      '422': [
        'APPLICATION.BUSINESS_OWNER_INVALID',
        'APPLICATION.DICTIONARY_LINE_MISMATCH',
        'APPLICATION.DICTIONARY_LINE_NOT_FOUND',
        'APPLICATION.DOMAIN_INVALID',
        'APPLICATION.FUNCTIONAL_GROUP_INVALID',
        'APPLICATION.INTERNAL_HAS_NO_VENDOR',
        'APPLICATION.NAME_INVALID',
        'APPLICATION.NOTE_INVALID',
        'APPLICATION.TOO_MANY_DOMAINS',
        'APPLICATION.VENDOR_NAME_INVALID',
        'APPLICATION.VENDOR_REQUIRED',
        'APPLICATION.VENDOR_SOURCE_AMBIGUOUS',
      ],
    },
    applicationGet: {
      '404': ['APPLICATION.NOT_FOUND'],
    },
    applicationRetire: {
      '404': ['APPLICATION.NOT_FOUND'],
      '409': ['APPLICATION.ALREADY_RETIRED', 'APPLICATION.RETIREMENT_BLOCKED'],
      '422': ['APPLICATION.RETIREMENT_NEEDS_CONFIRMATION'],
    },
    applicationRetirementConfirm: {
      '404': ['APPLICATION.NOT_FOUND'],
      '409': ['APPLICATION.ALREADY_RETIRED'],
      '422': ['APPLICATION.RETIREMENT_NOTE_REQUIRED', 'APPLICATION.RETIREMENT_NOT_BUSINESS_OWNER'],
    },
    applicationRetirementGet: {
      '404': ['APPLICATION.NOT_FOUND'],
    },
    applicationUpdate: {
      '404': ['APPLICATION.NOT_FOUND'],
      '409': ['APPLICATION.DICTIONARY_GROUP_CHANGED', 'APPLICATION.DICTIONARY_LINE_TAKEN', 'APPLICATION.NAME_TAKEN'],
      '422': [
        'APPLICATION.BUSINESS_OWNER_INVALID',
        'APPLICATION.DICTIONARY_LINE_MISMATCH',
        'APPLICATION.DICTIONARY_LINE_NOT_FOUND',
        'APPLICATION.DOMAIN_INVALID',
        'APPLICATION.FUNCTIONAL_GROUP_INVALID',
        'APPLICATION.INTERNAL_HAS_NO_VENDOR',
        'APPLICATION.NAME_INVALID',
        'APPLICATION.NOTE_INVALID',
        'APPLICATION.TOO_MANY_DOMAINS',
        'APPLICATION.UPDATE_EMPTY',
      ],
    },
    approvalRoleSet: {
      '404': ['ORGANIZATION.EMPLOYEE_NOT_FOUND'],
      '422': [
        'APPROVAL_ROLE.EMPLOYEE_NOT_ACTIVE',
        'APPROVAL_ROLE.NO_USABLE_ACCOUNT',
        'APPROVAL_ROLE.SUBSTITUTE_MUST_DIFFER',
        'APPROVAL_ROLE.SUPER_ADMIN_CANNOT_HOLD',
      ],
    },
    authLogin: {
      '401': ['AUTH.INVALID_CREDENTIALS'],
      '429': ['AUTH.LOGIN_TEMPORARILY_BLOCKED'],
      '503': ['AUTH.UNAVAILABLE'],
    },
    authLogout: {
      '503': ['AUTH.UNAVAILABLE'],
    },
    authRedeemInvitation: {
      '400': ['AUTH.INVITATION_INVALID'],
      '422': ['AUTH.PASSWORD_POLICY_VIOLATION'],
      '503': ['SERVICE_UNAVAILABLE'],
    },
    authRefresh: {
      '401': ['AUTH.SESSION_INVALID'],
      '503': ['AUTH.UNAVAILABLE'],
    },
    authRequestPasswordReset: {
      '503': ['AUTH.UNAVAILABLE'],
    },
    authResetPassword: {
      '400': ['AUTH.PASSWORD_RESET_INVALID'],
      '422': ['AUTH.PASSWORD_POLICY_VIOLATION'],
      '503': ['AUTH.UNAVAILABLE'],
    },
    contractCreate: {
      '422': ['CONTRACT.NAME_REQUIRED'],
    },
    contractGet: {
      '404': ['CONTRACT.NOT_FOUND'],
    },
    costCenterCreate: {
      '409': ['COST_CENTER.CODE_TAKEN', 'COST_CENTER.DEPARTMENT_ALREADY_LINKED'],
      '422': [
        'COST_CENTER.DEPARTMENT_NOT_ACTIVE',
        'COST_CENTER.KIND_NOT_SUPPORTED',
        'COST_CENTER.NAME_INVALID',
        'COST_CENTER.NAME_RESERVED',
      ],
    },
    costCenterDeactivate: {
      '404': ['COST_CENTER.NOT_FOUND'],
      '409': ['COST_CENTER.IN_USE'],
    },
    costCenterEmployeeList: {
      '404': ['COST_CENTER.NOT_FOUND'],
    },
    costCenterRename: {
      '404': ['COST_CENTER.NOT_FOUND'],
      '422': ['COST_CENTER.NAME_INVALID', 'COST_CENTER.NAME_RESERVED'],
    },
    departmentCreate: {
      '409': ['DEPARTMENT.CODE_TAKEN', 'DEPARTMENT.CREATION_AWAITING_ACTIVATION'],
      '422': ['DEPARTMENT.IT_ADMIN_INVALID', 'DEPARTMENT.NAME_INVALID'],
    },
    departmentDeactivate: {
      '404': ['DEPARTMENT.NOT_FOUND'],
      '409': ['DEPARTMENT.IN_USE'],
    },
    departmentGet: {
      '403': ['DEPARTMENT.OUT_OF_SCOPE'],
      '404': ['DEPARTMENT.NOT_FOUND'],
    },
    departmentHeadAssign: {
      '404': ['DEPARTMENT.NOT_FOUND'],
      '422': [
        'DEPARTMENT.HEAD_DATE_IN_PAST',
        'DEPARTMENT.HEAD_EMPLOYEE_NOT_ACTIVE',
        'DEPARTMENT.HEAD_EMPLOYEE_NOT_FOUND',
        'DEPARTMENT.HEAD_HEADS_ANOTHER_DEPARTMENT',
        'DEPARTMENT.HEAD_NOT_A_MEMBER_ON_DATE',
        'DEPARTMENT.HEAD_SUPER_ADMIN_CANNOT_HEAD',
      ],
    },
    departmentHeadVacate: {
      '404': ['DEPARTMENT.NOT_FOUND'],
      '422': ['DEPARTMENT.HEAD_DATE_IN_PAST'],
    },
    departmentMemberList: {
      '403': ['DEPARTMENT.OUT_OF_SCOPE'],
      '404': ['DEPARTMENT.NOT_FOUND'],
    },
    departmentToolsInUse: {
      '403': ['DEPARTMENT.OUT_OF_SCOPE'],
      '404': ['DEPARTMENT.NOT_FOUND'],
    },
    departmentUpdate: {
      '404': ['DEPARTMENT.NOT_FOUND'],
      '422': ['DEPARTMENT.IT_ADMIN_INVALID', 'DEPARTMENT.NAME_INVALID', 'DEPARTMENT.UPDATE_EMPTY'],
    },
    documentAttach: {
      '404': ['CONTRACT.NOT_FOUND', 'DOCUMENT.NOT_FOUND'],
      '409': ['DOCUMENT.ALREADY_ATTACHED', 'DOCUMENT.NOT_READY_TO_ATTACH'],
    },
    documentComplete: {
      '404': ['DOCUMENT.NOT_FOUND'],
      '409': ['DOCUMENT.NOT_AWAITING_UPLOAD', 'DOCUMENT.UPLOAD_EXPIRED', 'DOCUMENT.UPLOAD_PENDING'],
      '422': ['DOCUMENT.UPLOAD_MISMATCH'],
    },
    documentCreate: {
      '403': ['DOCUMENT.PURPOSE_FORBIDDEN'],
      '409': ['DOCUMENT.PURPOSE_NOT_AVAILABLE'],
      '422': ['DOCUMENT.FILE_INVALID', 'DOCUMENT.TOO_LARGE', 'DOCUMENT.TYPE_NOT_ALLOWED'],
    },
    documentGet: {
      '404': ['DOCUMENT.NOT_FOUND'],
    },
    documentLink: {
      '404': ['DOCUMENT.NOT_FOUND'],
    },
    employeeCreate: {
      '422': ['EMPLOYEE.ROW_INVALID'],
    },
    employeeImportCancel: {
      '404': ['IMPORT.NOT_FOUND'],
      '409': ['IMPORT.NOT_PREVIEW'],
    },
    employeeImportConfirm: {
      '404': ['IMPORT.NOT_FOUND'],
      '409': [
        'IMPORT.ALREADY_CONFIRMED',
        'IMPORT.CANCELLED',
        'IMPORT.DUPLICATE_FILE_NOT_ACKNOWLEDGED',
        'IMPORT.EXPIRED',
        'IMPORT.PREVIEW_OUTDATED',
        'IMPORT.PREVIEW_STALE',
      ],
    },
    employeeImportGet: {
      '404': ['IMPORT.NOT_FOUND'],
    },
    employeeImportPreviewRefresh: {
      '404': ['IMPORT.NOT_FOUND'],
      '409': ['IMPORT.CANCELLED', 'IMPORT.NOT_PREVIEW'],
    },
    employeeImportRowList: {
      '404': ['IMPORT.NOT_FOUND'],
    },
    employeeImportUpload: {
      '422': [
        'IMPORT.FILE_EMPTY',
        'IMPORT.FILE_MISSING_COLUMNS',
        'IMPORT.FILE_NOT_TEXT',
        'IMPORT.FILE_REQUIRED',
        'IMPORT.FILE_TOO_MANY_ROWS',
        'IMPORT.FILE_UNREADABLE',
      ],
    },
    employeeUpdateOfficialFields: {
      '403': ['EMPLOYEE.ANOTHER_IT_ADMIN_NEEDED'],
      '404': ['EMPLOYEE.NOT_FOUND'],
      '422': ['EMPLOYEE.ROW_INVALID', 'EMPLOYEE.UPDATE_EMPTY'],
    },
    exchangeRateRecord: {
      '409': ['EXCHANGE_RATE.ALREADY_RECORDED'],
      '422': [
        'CURRENCY_NOT_SUPPORTED',
        'EXCHANGE_RATE.DATE_IN_FUTURE',
        'EXCHANGE_RATE.DATE_TOO_OLD',
        'EXCHANGE_RATE.SAME_AS_REPORTING_CURRENCY',
        'RATE_OUT_OF_RANGE',
        'RATE_SCALE_EXCEEDED',
      ],
    },
    functionalGroupCreate: {
      '409': ['FUNCTIONAL_GROUP.NAME_TAKEN'],
      '422': ['FUNCTIONAL_GROUP.NAME_INVALID'],
    },
    functionalGroupUpdate: {
      '404': ['FUNCTIONAL_GROUP.NOT_FOUND'],
      '409': ['FUNCTIONAL_GROUP.NAME_TAKEN'],
      '422': ['FUNCTIONAL_GROUP.NAME_INVALID', 'FUNCTIONAL_GROUP.UPDATE_EMPTY'],
    },
    healthGetLiveness: {
      '500': ['INTERNAL_SERVER_ERROR'],
    },
    healthGetReadiness: {
      '500': ['INTERNAL_SERVER_ERROR'],
      '503': ['SERVICE_UNAVAILABLE'],
    },
    licenseAssignmentChangeResponsible: {
      '404': ['LICENSE_ASSIGNMENT.NOT_FOUND'],
      '409': ['LICENSE_ASSIGNMENT.NOT_OPEN', 'LICENSE_ASSIGNMENT.RESPONSIBLE_AFTER_DEADLINE'],
      '422': [
        'LICENSE_ASSIGNMENT.EFFECTIVE_DATE_INVALID',
        'LICENSE_ASSIGNMENT.EXPECTED_END_REQUIRED',
        'LICENSE_ASSIGNMENT.NOT_SERVICE_ACCOUNT',
        'LICENSE_ASSIGNMENT.RESPONSIBLE_INVALID',
      ],
    },
    licenseKeyImport: {
      '404': ['SUBSCRIPTION.NOT_FOUND'],
      '422': ['LICENSE_KEY.PLAN_NOT_K4'],
    },
    licenseKeyList: {
      '404': ['SUBSCRIPTION.NOT_FOUND'],
    },
    licenseKeyReveal: {
      '404': ['LICENSE_KEY.NOT_FOUND'],
    },
  };
