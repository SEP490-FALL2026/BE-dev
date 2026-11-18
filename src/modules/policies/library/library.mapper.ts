import type { PublishResult } from './library-publish.service';
import type { PolicyVersionRecord } from './library.types';

export function toPolicyDraft(draft: PolicyVersionRecord) {
  return {
    policyCode: draft.policyCode,
    title: draft.title,
    content: draft.content,
    applicableRoles: draft.applicableRoles,
    updatedAt: draft.updatedAt.toISOString(),
  };
}

export function toPublishedPolicyVersion({ version, notified }: PublishResult) {
  return {
    policyCode: version.policyCode,
    versionNumber: version.versionNumber,
    publishedAt: version.publishedAt.toISOString(),
    requiresReacknowledgement: version.requiresReacknowledgement,
    applicableRoles: version.applicableRoles,
    notified,
  };
}
