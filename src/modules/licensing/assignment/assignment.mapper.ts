import type { AssignmentView } from '../public/licensing.types';

/** An assignment as the wire carries it: the instants as ISO strings. */
export const toAssignmentWire = (view: AssignmentView) => ({
  ...view,
  failedAt: view.failedAt?.toISOString() ?? null,
  cancelledAt: view.cancelledAt?.toISOString() ?? null,
  createdAt: view.createdAt.toISOString(),
});
