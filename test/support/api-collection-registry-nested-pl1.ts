import type { NestedArrayEntry } from './api-collection-registry';

const OWNER = 'us-01-bootstrap-login-session';

/**
 * The nested arrays of the policy library (`QĐ-111ao`, `QĐ-111ar`, `QĐ-111bi`, `PL-1` of `fe-feedback`): the roles a version applies to, the sections
 * and steps and checklists of its text, and the list `GET /me` gives of the policies the caller has not acknowledged. Each is bounded by the schema
 * that reads it, and the text of a version is judged by the one codec before it is written, so none of them grows the answer.
 */
export const NESTED_ARRAYS_PL1: readonly NestedArrayEntry[] = [
  {
    key: 'meGet#pendingPolicyAcknowledgements',
    maxItems: 20,
    source:
      'the maxItems of the schema in me.dto.ts: the policies of the library the caller owes an acknowledgement of; the library is a fixed small set (R-42)',
  },
  {
    key: 'policyList#applicableRoles',
    maxItems: 6,
    source:
      'POLICY_ROLES in policies.types.ts, the maxItems of the schema in policy-reading.dto.ts: a role is named once',
  },
  {
    key: 'policyVersionList#applicableRoles',
    maxItems: 6,
    source:
      'POLICY_ROLES in policies.types.ts, the maxItems of the schema in policy-reading.dto.ts: a role is named once',
  },
  {
    key: 'policyGet#applicableRoles',
    maxItems: 6,
    source:
      'POLICY_ROLES in policies.types.ts, the maxItems of the schema in policy-reading.dto.ts: a role is named once',
  },
  {
    key: 'policyDraftGet#applicableRoles',
    maxItems: 6,
    source: 'POLICY_ROLES in policies.types.ts, the maxItems of the schema in library.dto.ts: a role is named once',
  },
  {
    key: 'policyGet#content.sections',
    maxItems: 30,
    source:
      'the maxItems of sections in library.json.ts: the codec of policy_versions.content refuses more when a draft is written',
  },
  {
    key: 'policyDraftGet#content.sections',
    maxItems: 30,
    source:
      'the maxItems of sections in library.json.ts: the codec of policy_versions.content refuses more when a draft is written',
  },
  {
    key: 'policyGet#content.steps',
    maxItems: 10,
    source:
      'the maxItems of steps in library.json.ts: the codec of policy_versions.content refuses more when a draft is written',
  },
  {
    key: 'policyDraftGet#content.steps',
    maxItems: 10,
    source:
      'the maxItems of steps in library.json.ts: the codec of policy_versions.content refuses more when a draft is written',
  },
  {
    key: 'policyGet#content.steps.checklist',
    maxItems: 30,
    source:
      'the maxItems of checklist in library.json.ts: the codec of policy_versions.content refuses more when a draft is written',
  },
  {
    key: 'policyDraftGet#content.steps.checklist',
    maxItems: 30,
    source:
      'the maxItems of checklist in library.json.ts: the codec of policy_versions.content refuses more when a draft is written',
  },
  {
    key: 'policyStepGet#step.checklist',
    maxItems: 30,
    source: 'the maxItems of checklist in library.json.ts: one step of a version in force, read through the same codec',
  },
].map(({ key, maxItems, source }): NestedArrayEntry => ({
  key,
  classification: 'bounded',
  findings: [],
  owner: OWNER,
  businessMaximum: { maxItems, source },
  rationale: 'A part of a policy of the library or of what the caller owes of it, read with a fixed upper bound.',
  removeWhen: 'Review when the codec of the content of a policy, POLICY_ROLES or the list of GET /me changes.',
}));
