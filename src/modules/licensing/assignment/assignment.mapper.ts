import type { AssignmentView } from '../public/licensing.types';

/** An assignment as the wire carries it: the instants as ISO strings. The term and the anchor of a personal right (K1) are kept for the rules, not sent. */
export const toAssignmentWire = (view: AssignmentView) => {
  const sent: Partial<AssignmentView> = { ...view };
  delete sent.personalCommitmentMonths;
  delete sent.billingAnchorOn;

  return {
    ...sent,
    failedAt: view.failedAt?.toISOString() ?? null,
    cancelledAt: view.cancelledAt?.toISOString() ?? null,
    createdAt: view.createdAt.toISOString(),
  };
};
