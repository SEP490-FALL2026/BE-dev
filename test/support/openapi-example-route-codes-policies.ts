import type { RouteErrorStatus } from './openapi-example-manifest';

/**
 * Part of ROUTE_ERROR_CODES (policies and import templates, `PL-1`, `PL-3`; the picture and the work phone of a person, `PF-1`), traced from
 * each handler to the mapper of `library.http-errors.ts`, `acknowledgement.http-errors.ts`, `import-template` and `profile.http-errors.ts`:
 * see openapi-example-manifest.ts. A 413 of a multipart route is told twice: by the policy for a file a little over the limit, and by the
 * parser (HTTP_PAYLOAD_TOO_LARGE) for any larger one.
 */
export const ROUTE_ERROR_CODES_POLICIES: Readonly<
  Record<string, Partial<Record<RouteErrorStatus, readonly string[]>>>
> = {
  policyGet: { '404': ['POLICY.NOT_FOUND'], '409': ['POLICY.NOT_PUBLISHED'] },
  policyVersionList: { '404': ['POLICY.NOT_FOUND'] },
  policyStepGet: {
    '404': ['POLICY.NOT_FOUND', 'POLICY.STEP_NOT_FOUND'],
    '409': ['POLICY.NOT_PUBLISHED'],
  },
  policyDraftGet: { '404': ['POLICY.DRAFT_NOT_FOUND', 'POLICY.NOT_FOUND'] },
  policyDraftPut: {
    '404': ['POLICY.NOT_FOUND'],
    '409': ['POLICY.NOT_PUBLISHED'],
    '422': ['POLICY.STEP_SET_FIXED', 'POLICY.SYSTEM_ITEM_UNKNOWN'],
  },
  policyDraftDelete: { '404': ['POLICY.DRAFT_NOT_FOUND', 'POLICY.NOT_FOUND'] },
  policyDraftPublish: {
    '404': ['POLICY.DRAFT_NOT_FOUND', 'POLICY.NOT_FOUND'],
    '422': ['POLICY.STEP_SET_FIXED', 'POLICY.SYSTEM_ITEM_UNKNOWN'],
  },
  policyAcknowledgementCreate: {
    '404': ['POLICY.NOT_FOUND'],
    '409': ['POLICY.ACKNOWLEDGEMENT_NOT_REQUIRED', 'POLICY.NOT_PUBLISHED'],
  },
  policyAcknowledgementReport: { '404': ['POLICY.NOT_FOUND'], '409': ['POLICY.NOT_PUBLISHED'] },
  importTemplateGet: {
    '404': ['IMPORT_TEMPLATE.NOT_FOUND'],
    '422': ['IMPORT_TEMPLATE.FORMAT_NOT_SUPPORTED'],
  },
  meAvatarPut: {
    '413': ['PROFILE.AVATAR_TOO_LARGE'],
    '415': ['PROFILE.AVATAR_TYPE_UNSUPPORTED'],
    '422': ['PROFILE.AVATAR_EMPTY', 'PROFILE.AVATAR_FILE_REQUIRED', 'PROFILE.AVATAR_TYPE_MISMATCH'],
  },
  meProfilePatch: { '422': ['PROFILE.WORK_PHONE_INVALID'] },
  appUserAvatarDelete: { '404': ['APP_USER.NOT_FOUND'], '409': ['PROFILE.AVATAR_NOT_SET'] },
};
