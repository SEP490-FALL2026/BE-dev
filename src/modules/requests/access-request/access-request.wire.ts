import type { AccessRequestView } from './access-request-query.service';

/** A request as the wire carries it: the dates written as text. */
export const toWire = (view: AccessRequestView) => ({
  ...view,
  submittedAt: view.submittedAt.toISOString(),
  needStep: {
    ...view.needStep,
    createdAt: view.needStep.createdAt.toISOString(),
    assignedAt: view.needStep.assignedAt?.toISOString() ?? null,
    decidedAt: view.needStep.decidedAt?.toISOString() ?? null,
  },
  withdrawal: view.withdrawal && {
    ...view.withdrawal,
    requestedAt: view.withdrawal.requestedAt.toISOString(),
    withdrawnAt: view.withdrawal.withdrawnAt?.toISOString() ?? null,
  },
  cancellation: view.cancellation && {
    ...view.cancellation,
    cancelledAt: view.cancellation.cancelledAt.toISOString(),
  },
  serviceAccount: view.serviceAccount && {
    ...view.serviceAccount,
    boundary: {
      ...view.serviceAccount.boundary,
      decidedAt: view.serviceAccount.boundary.decidedAt?.toISOString() ?? null,
    },
  },
  renewal: view.renewal && {
    ...view.renewal,
    applied: view.renewal.applied && {
      ...view.renewal.applied,
      appliedAt: view.renewal.applied.appliedAt.toISOString(),
    },
  },
  needDecision: view.needDecision && { ...view.needDecision, decidedAt: view.needDecision.decidedAt.toISOString() },
});
