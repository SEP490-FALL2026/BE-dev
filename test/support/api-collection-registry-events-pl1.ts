import type { RegistryEvent } from './api-collection-registry';

/** The events of the nested-array registry written by `PL-1` (the policy library, `QĐ-111ao`, `QĐ-111ar`, `QĐ-111bi`, of `fe-feedback`). */
export const PL1_REGISTRY_EVENTS: readonly RegistryEvent[] = [
  'meGet#pendingPolicyAcknowledgements',
  'policyList#applicableRoles',
  'policyVersionList#applicableRoles',
  'policyGet#applicableRoles',
  'policyDraftGet#applicableRoles',
  'policyGet#content.sections',
  'policyDraftGet#content.sections',
  'policyGet#content.steps',
  'policyDraftGet#content.steps',
  'policyGet#content.steps.checklist',
  'policyDraftGet#content.steps.checklist',
  'policyStepGet#step.checklist',
].map((key): RegistryEvent => ({
  registry: 'nested',
  key,
  change: 'added',
  to: 'bounded',
  bound: key.endsWith('applicableRoles') ? 'POLICY_ROLES' : 'maxItems',
  finding: 'LD-14',
  item: 'us-01-bootstrap-login-session',
  date: '2026-11-15',
  reason:
    'A part of a policy of the library or the list of policies the caller owes: bounded by the schema that reads it and by the codec that judges the text before it is written.',
}));
