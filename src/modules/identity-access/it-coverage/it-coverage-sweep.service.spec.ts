import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { NotificationsApi } from '../../notifications/public/notifications.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AccountRecordService } from '../accounts/account-record.service';
import { ItCoverageNotifier } from './it-coverage-notifier.service';
import { ItCoverageSweepService } from './it-coverage-sweep.service';

describe('ItCoverageSweepService', () => {
  const tx = { name: 'tx' };
  const monday = new Date('2026-11-23T09:00:00+07:00');
  const saturday = new Date('2026-11-21T09:00:00+07:00');
  const sunday = new Date('2026-11-22T09:00:00+07:00');

  const organizationReads = {
    getOrganization: jest.fn(),
    getActiveDepartmentsForItCoverage: jest.fn(),
    itAdminsActingFor: jest.fn(),
  };
  const accounts = {
    findUsableSuperAdminEmployeeId: jest.fn(),
    findUsableItAdminEmployeeIds: jest.fn(),
  };
  const notifications = {
    notifyInApp: jest.fn(),
  };
  const runner = {
    run: jest.fn((work: (t: unknown) => Promise<unknown>) => work(tx)),
  };

  const makeService = () =>
    new ItCoverageSweepService(
      organizationReads as unknown as OrganizationReadApi,
      accounts as unknown as AccountRecordService,
      runner as unknown as TransactionRunner,
      new ItCoverageNotifier(notifications as unknown as NotificationsApi),
    );

  beforeEach(() => {
    jest.clearAllMocks();
    organizationReads.getOrganization.mockResolvedValue({
      id: 'org-1',
      name: 'Acme',
      timeZone: 'Asia/Ho_Chi_Minh',
      reportingCurrency: 'VND',
    });
    accounts.findUsableSuperAdminEmployeeId.mockResolvedValue('emp-sa');
    accounts.findUsableItAdminEmployeeIds.mockResolvedValue(new Set(['emp-usable']));
    notifications.notifyInApp.mockResolvedValue(true);
  });

  it.each([
    ['Saturday', saturday],
    ['Sunday', sunday],
  ])('skips sweep on %s', async (_label, day) => {
    const result = await makeService().run(day);

    expect(result).toEqual({ told: 0 });
    expect(accounts.findUsableSuperAdminEmployeeId).not.toHaveBeenCalled();
    expect(organizationReads.getActiveDepartmentsForItCoverage).not.toHaveBeenCalled();
    expect(notifications.notifyInApp).not.toHaveBeenCalled();
  });

  it('returns told: 0 when organization or usable Super Admin is missing', async () => {
    organizationReads.getOrganization.mockResolvedValueOnce(null);
    expect(await makeService().run(monday)).toEqual({ told: 0 });

    accounts.findUsableSuperAdminEmployeeId.mockResolvedValueOnce(null);
    expect(await makeService().run(monday)).toEqual({ told: 0 });
    expect(organizationReads.getActiveDepartmentsForItCoverage).not.toHaveBeenCalled();
  });

  it('notifies Super Admin only for non-starting active departments with neither in-charge nor substitute', async () => {
    organizationReads.getActiveDepartmentsForItCoverage.mockResolvedValue([
      { id: 'dep-no-ic', code: 'D1', name: 'Design', itAdminEmployeeId: null, itAdminStatus: null },
      { id: 'dep-dead-ic', code: 'D2', name: 'Sales', itAdminEmployeeId: 'emp-left', itAdminStatus: 'TERMINATED' },
      { id: 'dep-sub-ok', code: 'D3', name: 'Ops', itAdminEmployeeId: 'emp-left', itAdminStatus: 'TERMINATED' },
      { id: 'dep-ic-ok', code: 'D4', name: 'Eng', itAdminEmployeeId: 'emp-usable', itAdminStatus: 'ACTIVE' },
    ]);
    organizationReads.itAdminsActingFor.mockResolvedValue(
      new Map([
        ['dep-no-ic', { inCharge: null, substitute: null, defaultAssignee: null, actors: [] }],
        ['dep-dead-ic', { inCharge: null, substitute: null, defaultAssignee: null, actors: [] }],
        ['dep-sub-ok', { inCharge: null, substitute: 'emp-sub', defaultAssignee: 'emp-sub', actors: ['emp-sub'] }],
        [
          'dep-ic-ok',
          { inCharge: 'emp-usable', substitute: null, defaultAssignee: 'emp-usable', actors: ['emp-usable'] },
        ],
      ]),
    );
    notifications.notifyInApp.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const result = await makeService().run(monday);

    expect(organizationReads.itAdminsActingFor).toHaveBeenCalledWith(
      ['dep-no-ic', 'dep-dead-ic', 'dep-sub-ok', 'dep-ic-ok'],
      expect.any(Function),
    );
    expect(notifications.notifyInApp).toHaveBeenCalledTimes(2);
    expect(notifications.notifyInApp).toHaveBeenNthCalledWith(1, tx, {
      organizationId: 'org-1',
      recipientEmployeeId: 'emp-sa',
      code: 'DEPARTMENT_IT_COVERAGE_MISSING',
      subject: { type: 'DEPARTMENT', id: 'dep-no-ic' },
      params: {
        departmentId: 'dep-no-ic',
        departmentName: 'Design',
        inChargeEmployeeId: null,
        reason: 'NO_IN_CHARGE',
      },
      eventKey: 'departmentItCoverage:dep-no-ic:2026-11-23',
    });
    expect(notifications.notifyInApp).toHaveBeenNthCalledWith(2, tx, {
      organizationId: 'org-1',
      recipientEmployeeId: 'emp-sa',
      code: 'DEPARTMENT_IT_COVERAGE_MISSING',
      subject: { type: 'DEPARTMENT', id: 'dep-dead-ic' },
      params: {
        departmentId: 'dep-dead-ic',
        departmentName: 'Sales',
        inChargeEmployeeId: 'emp-left',
        reason: 'IN_CHARGE_NOT_USABLE',
      },
      eventKey: 'departmentItCoverage:dep-dead-ic:2026-11-23',
    });
    expect(result).toEqual({ told: 1 });
  });
});
