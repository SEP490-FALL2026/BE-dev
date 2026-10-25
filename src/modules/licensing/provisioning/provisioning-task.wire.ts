import type { TaskSummaryView, TaskView } from './provisioning-task-view.service';

/** The wire form of a task card: the instants as ISO strings, the rest as the view has it. */
export const toSummaryWire = (view: TaskSummaryView) => ({
  ...view,
  createdAt: view.createdAt.toISOString(),
  claimedAt: view.claimedAt?.toISOString() ?? null,
  completedAt: view.completedAt?.toISOString() ?? null,
  failedAt: view.failedAt?.toISOString() ?? null,
  nextRetryAt: view.nextRetryAt?.toISOString() ?? null,
  closedAt: view.closedAt?.toISOString() ?? null,
});

export const toWire = (view: TaskView) => ({ ...toSummaryWire(view), ...detailOf(view) });

const detailOf = (view: TaskView) => ({
  steps: view.steps,
  doneWhen: view.doneWhen,
  completedBy: view.completedBy,
  evidence: view.evidence,
  failedBy: view.failedBy,
  failureReason: view.failureReason,
  lastError: view.lastError,
  handedOffBy: view.handedOffBy,
  handedOffAt: view.handedOffAt?.toISOString() ?? null,
  handOffEvidence: view.handOffEvidence,
  closedBy: view.closedBy,
  closeReason: view.closeReason,
  revocation: view.revocation && {
    ...view.revocation,
    firstReason: view.revocation.firstReason && {
      ...view.revocation.firstReason,
      decidedAt: view.revocation.firstReason.decidedAt.toISOString(),
    },
  },
});
