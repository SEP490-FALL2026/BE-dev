import { Test } from '@nestjs/testing';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OrganizationApi } from '../public/organization.api';
import { OrganizationChangeListeners } from '../public/organization.extension-points';
import type { OrganizationChange } from '../public/organization.types';
import { HeldNoticeHandoverListener } from './held-notice-handover.listener';

const tx = { name: 'tx' } as never;

const started = (
  overrides: Partial<Extract<OrganizationChange, { kind: 'HEAD_PERIOD_START' }>> = {},
): OrganizationChange => ({
  id: 'change-1',
  kind: 'HEAD_PERIOD_START',
  periodId: 'period-1',
  departmentId: 'dep-1',
  headEmployeeId: 'head-1',
  previousHeadEmployeeId: null,
  effectiveOn: '2026-10-28',
  ...overrides,
});

/**
 * `T-11` (spec amendment of the review): the notices kept for a department that nobody headed are handed to the head when
 * their period STARTS, by hearing `HEAD_PERIOD_START` on the registry of the organization, and by nothing else.
 */
describe('HeldNoticeHandoverListener', () => {
  const organization = { getOrganization: jest.fn() };
  const notifications = { deliverHeldToHead: jest.fn() };

  let changes: OrganizationChangeListeners;

  async function listener(): Promise<HeldNoticeHandoverListener> {
    changes = new OrganizationChangeListeners();
    const moduleRef = await Test.createTestingModule({
      providers: [
        HeldNoticeHandoverListener,
        { provide: OrganizationApi, useValue: organization },
        { provide: NotificationsApi, useValue: notifications },
        { provide: OrganizationChangeListeners, useValue: changes },
      ],
    }).compile();

    return moduleRef.get(HeldNoticeHandoverListener);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    organization.getOrganization.mockResolvedValue({ id: 'org-1' });
    notifications.deliverHeldToHead.mockResolvedValue(2);
  });

  it('registers itself on the change registry when the module starts', async () => {
    const instance = await listener();

    instance.onModuleInit();

    expect(changes.names()).toEqual(['organization.held-notice-handover']);
  });

  it('hands the kept notices of the department to the head whose period starts, in the transaction of the change', async () => {
    await (await listener()).onChange(tx, started());

    expect(notifications.deliverHeldToHead).toHaveBeenCalledTimes(1);
    expect(notifications.deliverHeldToHead).toHaveBeenCalledWith(tx, {
      organizationId: 'org-1',
      departmentId: 'dep-1',
      headEmployeeId: 'head-1',
    });
  });

  it.each([
    [
      'HEAD_PERIOD_END',
      {
        id: 'c',
        kind: 'HEAD_PERIOD_END',
        periodId: 'p',
        departmentId: 'dep-1',
        headEmployeeId: 'h',
        effectiveOn: '2026-10-28',
      },
    ],
    [
      'PLACEMENT_START',
      {
        id: 'c',
        kind: 'PLACEMENT_START',
        placementId: 'p',
        employeeId: 'e',
        fromDepartmentId: null,
        toDepartmentId: 'dep-1',
        effectiveOn: '2026-10-28',
      },
    ],
    ['EMPLOYEE_LEFT', { id: 'c', kind: 'EMPLOYEE_LEFT', employeeId: 'e', effectiveOn: '2026-10-28' }],
  ] as [string, OrganizationChange][])('hands nothing over for %s', async (_kind, change) => {
    await (await listener()).onChange(tx, change);

    expect(notifications.deliverHeldToHead).not.toHaveBeenCalled();
  });

  it('lets a failure of the hand-over reach the transaction, so the head period is not announced without it', async () => {
    notifications.deliverHeldToHead.mockRejectedValue(new Error('inbox refused'));

    await expect((await listener()).onChange(tx, started())).rejects.toThrow('inbox refused');
  });
});
