import type { CatalogApi } from '../../../catalog/public/catalog.api';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { ProvisioningTaskReasonRepo } from '../provisioning-task-reason.repo';
import type { ProvisioningK1ChecklistRepo } from './provisioning-k1-checklist.repo';
import { ProvisioningK1Checklist } from './provisioning-k1-checklist.service';

const PERSON = 'e-1';
const BLOCKED = new Date('2026-11-10T10:00:00Z');
const lockTicked = (completedAt: Date) => ({
  variant: 'DEPARTURE' as const,
  items: [{ code: 'MAILBOX_LOCKED' as const, order: 6, doneAt: completedAt.toISOString() }],
  completedAt,
});

const serviceWith = (kept: ReturnType<typeof lockTicked>[]) =>
  new ProvisioningK1Checklist(
    { completedOf: () => Promise.resolve(new Map([[PERSON, kept]])) } as unknown as ProvisioningK1ChecklistRepo,
    {} as ProvisioningTaskReasonRepo,
    {} as CatalogApi,
    {} as OrganizationReadApi,
  );

/** Audit B-4: the lock of the mailbox read for a departure is one ticked since this departure blocked access, never one of an earlier departure. */
describe('the people whose lock of the mailbox was ticked, for the departure that waits for it', () => {
  it('counts a lock ticked by a revocation completed after the block of this departure', async () => {
    const ticked = await serviceWith([lockTicked(new Date('2026-11-11T09:00:00Z'))]).mailboxLockedAmong([
      { employeeId: PERSON, since: BLOCKED },
    ]);

    expect([...ticked]).toEqual([PERSON]);
  });

  it('does not count a lock ticked before it: that was an earlier departure, cancelled since', async () => {
    const ticked = await serviceWith([lockTicked(new Date('2026-06-01T09:00:00Z'))]).mailboxLockedAmong([
      { employeeId: PERSON, since: BLOCKED },
    ]);

    expect(ticked.size).toBe(0);
  });
});
