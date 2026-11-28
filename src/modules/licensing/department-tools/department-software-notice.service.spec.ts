import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { NotificationsApi } from '../../notifications/public/notifications.api';
import type { InAppNotificationInput } from '../../notifications/public/notifications.types';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { SoftwareProposal } from './department-software.types';
import { DepartmentSoftwareNotice } from './department-software-notice.service';

const TX = {} as DbTx;
const PROPOSAL: SoftwareProposal = {
  id: 'prop-1',
  organizationId: 'org-1',
  departmentId: 'dept-1',
  applicationId: 'app-1',
  planId: 'plan-1',
  reason: 'Needed for team',
  state: 'PENDING',
  proposedByEmployeeId: 'head-1',
  proposedAt: new Date('2026-11-01T00:00:00Z'),
  decidedAt: null,
  decisionReason: null,
};

function setup(world: {
  inCharge?: string | null;
  substitute?: string | null;
  usableItAdmins?: string[];
  superAdmin?: string | null;
}) {
  const told: InAppNotificationInput[] = [];
  const notifications = {
    notifyInApp: jest.fn((_tx: DbTx, input: InAppNotificationInput) => {
      told.push(input);
      return Promise.resolve(true);
    }),
  } as unknown as NotificationsApi;
  const usableSet = new Set(world.usableItAdmins ?? []);
  const findUsableItAdminEmployeeIds = jest.fn((ids: readonly string[]) =>
    Promise.resolve(new Set(ids.filter((id) => usableSet.has(id)))),
  );
  const findAllUsableItAdminEmployeeIds = jest.fn().mockResolvedValue(['other-it']);
  const findUsableSuperAdminEmployeeId = jest.fn().mockResolvedValue(world.superAdmin ?? null);
  const identity = {
    findUsableItAdminEmployeeIds,
    findAllUsableItAdminEmployeeIds,
    findUsableSuperAdminEmployeeId,
  } as unknown as IdentityAccessApi;

  const itAdminsActingFor = jest.fn(
    async (deptIds: readonly string[], usableAmong: (ids: string[]) => Promise<Set<string>>) => {
      const candidates = [world.inCharge, world.substitute].filter((id): id is string => Boolean(id));
      const usable = candidates.length === 0 ? new Set<string>() : await usableAmong(candidates);
      const inCharge = world.inCharge && usable.has(world.inCharge) ? world.inCharge : null;
      const substitute = world.substitute && usable.has(world.substitute) ? world.substitute : null;
      const actors = [inCharge, substitute].filter((id): id is string => id !== null);
      return new Map(
        deptIds.map((id) => [id, { inCharge, substitute, defaultAssignee: substitute ?? inCharge, actors }]),
      );
    },
  );
  const organizationReads = { itAdminsActingFor } as unknown as OrganizationReadApi;

  return {
    notice: new DepartmentSoftwareNotice(notifications, organizationReads, identity),
    told,
    findAllUsableItAdminEmployeeIds,
    itAdminsActingFor,
  };
}

describe('DepartmentSoftwareNotice', () => {
  it('notifies usable in-charge IT Admin on proposed', async () => {
    const { notice, told, findAllUsableItAdminEmployeeIds } = setup({
      inCharge: 'it-1',
      usableItAdmins: ['it-1'],
      superAdmin: 'sa-1',
    });

    await notice.proposed(TX, PROPOSAL);

    expect(told.map((n) => n.recipientEmployeeId)).toEqual(['it-1']);
    expect(told[0].code).toBe('DEPARTMENT_SOFTWARE_PROPOSED');
    expect(findAllUsableItAdminEmployeeIds).not.toHaveBeenCalled();
  });

  it('notifies active substitute alongside usable in-charge IT Admin', async () => {
    const { notice, told } = setup({
      inCharge: 'it-1',
      substitute: 'sub-1',
      usableItAdmins: ['it-1', 'sub-1'],
      superAdmin: 'sa-1',
    });

    await notice.proposed(TX, PROPOSAL);

    expect(told.map((n) => n.recipientEmployeeId)).toEqual(['it-1', 'sub-1']);
  });

  it('notifies only active substitute when in-charge IT Admin is locked', async () => {
    const { notice, told } = setup({
      inCharge: 'it-locked',
      substitute: 'sub-1',
      usableItAdmins: ['sub-1'],
      superAdmin: 'sa-1',
    });

    await notice.proposed(TX, PROPOSAL);

    expect(told.map((n) => n.recipientEmployeeId)).toEqual(['sub-1']);
  });

  it('falls back to usable Super Admin when no acting IT Admin exists and never broadcasts to all IT Admins', async () => {
    const { notice, told, findAllUsableItAdminEmployeeIds } = setup({
      inCharge: 'it-locked',
      usableItAdmins: [],
      superAdmin: 'sa-1',
    });

    await notice.proposed(TX, PROPOSAL);

    expect(told.map((n) => n.recipientEmployeeId)).toEqual(['sa-1']);
    expect(findAllUsableItAdminEmployeeIds).not.toHaveBeenCalled();
  });

  it('notifies nobody when neither acting IT Admin nor usable Super Admin exists', async () => {
    const { notice, told } = setup({ inCharge: null, usableItAdmins: [], superAdmin: null });

    await notice.proposed(TX, PROPOSAL);

    expect(told).toEqual([]);
  });

  it('still notifies the proposing head on decided', async () => {
    const { notice, told } = setup({});

    await notice.decided(TX, PROPOSAL, { state: 'REJECTED', reason: 'Duplicate' });

    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({
      recipientEmployeeId: 'head-1',
      code: 'DEPARTMENT_SOFTWARE_PROPOSAL_DECIDED',
      params: { decision: 'REJECTED', reason: 'Duplicate' },
    });
  });
});
