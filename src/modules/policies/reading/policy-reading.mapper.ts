import type { MyAcknowledgement } from '../acknowledgement/acknowledgement.policy';
import type { PolicyContent } from '../library/library.json';
import type { PolicyRecord, PublishedVersionRecord } from '../library/library.types';

export function toPolicySummary(
  policy: PolicyRecord,
  current: PublishedVersionRecord,
  myAcknowledgement: MyAcknowledgement,
  showDraft: boolean,
) {
  return {
    code: policy.code,
    title: current.title,
    versionNumber: current.versionNumber,
    publishedAt: current.publishedAt.toISOString(),
    requiresReacknowledgement: current.requiresReacknowledgement,
    applicableRoles: current.applicableRoles,
    hasDraft: showDraft ? policy.hasDraft : null,
    myAcknowledgement,
  };
}

export function toPolicyDetail(
  version: PublishedVersionRecord,
  isCurrent: boolean,
  myAcknowledgement: MyAcknowledgement | null,
) {
  return {
    id: version.id,
    code: version.policyCode,
    title: version.title,
    versionNumber: version.versionNumber,
    isCurrent,
    publishedAt: version.publishedAt.toISOString(),
    changeNote: version.changeNote,
    requiresReacknowledgement: version.requiresReacknowledgement,
    applicableRoles: version.applicableRoles,
    content: version.content,
    myAcknowledgement,
  };
}

export function toVersionSummary(version: PublishedVersionRecord) {
  return {
    versionNumber: version.versionNumber,
    publishedAt: version.publishedAt.toISOString(),
    changeNote: version.changeNote,
    requiresReacknowledgement: version.requiresReacknowledgement,
    applicableRoles: version.applicableRoles,
  };
}

export function toPolicyStep(version: PublishedVersionRecord, step: PolicyContent['steps'][number]) {
  return { policyCode: version.policyCode, policyVersionId: version.id, versionNumber: version.versionNumber, step };
}
