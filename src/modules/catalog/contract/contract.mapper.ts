import type { ContractSubscriptionBrief } from './contract-subscription.repo';
import type { ContractDetailView, ContractSummaryView } from './contract-query.service';
import type { AttachedDocumentRow } from './document.repo';

export const toContractSummaryWire = (contract: ContractSummaryView) => ({
  id: contract.id,
  name: contract.name,
  number: contract.number,
  vendor: contract.vendor,
  effectiveFrom: contract.effectiveFrom,
  effectiveTo: contract.effectiveTo,
  status: contract.status,
  subscriptionCount: contract.subscriptionCount,
  createdAt: contract.createdAt.toISOString(),
  updatedAt: contract.updatedAt.toISOString(),
});

export const toContractSubscriptionWire = (subscription: ContractSubscriptionBrief) => ({
  subscriptionId: subscription.subscriptionId,
  status: subscription.status,
  kind: subscription.kind,
  startDate: subscription.startDate,
  endDate: subscription.endDate,
  planId: subscription.planId,
  planName: subscription.planName,
  provisioningType: subscription.provisioningType,
  applicationId: subscription.applicationId,
  applicationName: subscription.applicationName,
  logoUrl: subscription.logoUrl,
  linkedAt: subscription.linkedAt.toISOString(),
});

const toContractDocumentWire = (document: AttachedDocumentRow) => ({
  id: document.id,
  purpose: document.purpose,
  fileName: document.fileName,
  contentType: document.contentType,
  sizeBytes: document.sizeBytes,
  attachedAt: document.attachedAt.toISOString(),
});

export const toContractDetailWire = (contract: ContractDetailView) => ({
  ...toContractSummaryWire(contract),
  note: contract.note,
  createdBy: contract.createdByAppUserId,
  subscriptions: contract.subscriptions.map(toContractSubscriptionWire),
  documents: contract.documents.map(toContractDocumentWire),
  applicationIds: contract.applicationIds,
  truncated: contract.truncated,
});
