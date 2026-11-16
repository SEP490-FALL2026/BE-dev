/** Part of SUCCESS_MESSAGES: the success `message` of the policies, and of the picture and the work phone of a person (PL-1, PF-1). */
export const SUCCESS_MESSAGES_POLICIES: Readonly<Record<string, string>> = {
  policyList: 'POLICY.LIST_FETCHED',
  policyGet: 'POLICY.FETCHED',
  policyVersionList: 'POLICY.VERSIONS_FETCHED',
  policyStepGet: 'POLICY.STEP_FETCHED',
  policyDraftGet: 'POLICY_DRAFT.FETCHED',
  policyDraftPut: 'POLICY_DRAFT.SAVED',
  policyDraftDelete: 'POLICY_DRAFT.DISCARDED',
  policyDraftPublish: 'POLICY_VERSION.PUBLISHED',
  policyAcknowledgementCreate: 'POLICY_ACKNOWLEDGEMENT.RECORDED',
  policyAcknowledgementReport: 'POLICY_ACKNOWLEDGEMENT.REPORT_FETCHED',
  meAvatarPut: 'PROFILE.AVATAR_CHANGED',
  meAvatarDelete: 'PROFILE.AVATAR_REMOVED',
  meProfilePatch: 'PROFILE.WORK_PHONE_CHANGED',
  employeeProfileLookup: 'PROFILE.LOOKED_UP',
  appUserAvatarDelete: 'PROFILE.AVATAR_REMOVED_BY_ADMIN',
};
