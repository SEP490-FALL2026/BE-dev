import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { NotificationsApi } from '../../notifications/public/notifications.api';
import type { InAppNotificationInput } from '../../notifications/public/notifications.types';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PersonnelNotifier } from './personnel-notifier.service';

const TX = {} as DbTx;
const ORGANIZATION = 'org-1';

/** A notifier over the people of a world: who holds the Super Admin role, who answers for the department, and who can act as an IT Admin. */
function notifierOf(world: { superAdmin: string; itAdminOfDepartment?: string; usableItAdmins?: string[] }) {
  const told: InAppNotificationInput[] = [];
  const notifications = {
    notifyInApp: jest.fn((_tx: DbTx, input: InAppNotificationInput) => {
      told.push(input);

      return Promise.resolve(true);
    }),
  } as unknown as NotificationsApi;
  const organization = {
    getItAdminInChargeOfDepartment: () => Promise.resolve(world.itAdminOfDepartment ?? null),
  } as unknown as OrganizationReadApi;
  const identity = {
    getSuperAdminHolder: () => Promise.resolve({ employeeId: world.superAdmin }),
    findAllUsableItAdminEmployeeIds: () => Promise.resolve(world.usableItAdmins ?? []),
  } as unknown as IdentityAccessApi;

  return { notifier: new PersonnelNotifier(notifications, organization, identity), told };
}

const recipients = (told: InAppNotificationInput[], code: string) =>
  told
    .filter((notice) => notice.code === code)
    .map((notice) => `${notice.recipientEmployeeId}:${String(notice.params.audience ?? '-')}`)
    .sort();

const facts = { organizationId: ORGANIZATION, employeeId: 'leaver', departmentId: 'd1', caseId: 'c1' };

describe('what a departure tells the IT Admin and the Super Admin (QĐ-110b, QĐ-110d, R-1)', () => {
  const blocked = { ...facts, blockedOn: '2026-10-01', revocationDueOn: '2026-10-02', markLeft: true };

  it('tells the IT Admin to block the company account only while it is not blocked yet: a case that already has the lock gets no such notice', async () => {
    const open = notifierOf({ superAdmin: 'sa', itAdminOfDepartment: 'it1' });
    const locked = notifierOf({ superAdmin: 'sa', itAdminOfDepartment: 'it1' });

    await open.notifier.departureAccessBlocked(TX, { ...blocked, accountLocked: false });
    await locked.notifier.departureAccessBlocked(TX, { ...blocked, accountLocked: true });

    expect(recipients(open.told, 'DEPARTURE_ACCESS_BLOCKED')).toEqual(['it1:IT_ADMIN', 'sa:SUPER_ADMIN']);
    // The Super Admin still marks the person as left; the IT Admin has nothing to block.
    expect(recipients(locked.told, 'DEPARTURE_ACCESS_BLOCKED')).toEqual(['sa:SUPER_ADMIN']);
  });
});
