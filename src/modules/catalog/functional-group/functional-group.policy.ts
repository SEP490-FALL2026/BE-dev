import { FunctionalGroupFixedError } from './functional-group.errors';
import { isFixedGroup, type FunctionalGroupSystemKey } from './functional-group-standard.policy';
import type { FunctionalGroupStatus } from './functional-group.types';

/**
 * A fixed group (Liên lạc, Khác: `QĐ-111bf`) is never renamed or switched off: the system relies on one to hold the applications declared
 * with no group and on the other to keep the usage rules away from communication software. A request that changes nothing of it is not a
 * change. Throws FunctionalGroupFixedError.
 */
export function assertGroupChangeAllowed(
  current: { name: string; status: FunctionalGroupStatus; systemKey: FunctionalGroupSystemKey | null },
  change: { name?: string; status?: FunctionalGroupStatus },
): void {
  if (!isFixedGroup(current)) return;
  const renames = change.name !== undefined && change.name !== current.name;
  const switches = change.status !== undefined && change.status !== current.status;
  if (renames || switches) throw new FunctionalGroupFixedError();
}
