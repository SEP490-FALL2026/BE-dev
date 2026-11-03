import { Test } from '@nestjs/testing';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { FinanceApi } from '../../finance/public/finance.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { BudgetNotifierService } from './budget-notifier.service';
import { BudgetFactsService } from './budget-facts.service';
import type { ProposalRecord } from './proposal.repo';
import type { VersionRecord } from './version.repo';

const tx = { name: 'tx' } as unknown as DbTx;
const TODAY = '2026-10-28';
const proposal = {
  id: 'proposal-1',
  organizationId: 'org-1',
  costCenterId: 'cc-1',
  year: 2027,
  submittedByEmployeeId: 'sender',
  returnedReason: 'Add the quotes',
} as unknown as ProposalRecord;

/**
 * The race of a kept notice and the assignment of a first head: a writer that may KEEP a notice for a department takes the
 * department `FOR SHARE` before it reads the head, so the assignment (which holds it `FOR UPDATE` and hands the kept notices over
 * before it commits) and the writer cannot interleave and leave a notice kept for a department that has a head.
 */
describe('the notices of the budget loops that may be kept for a department with no head', () => {
  describe('BudgetNotifierService', () => {
    const support = {
      departmentsOf: jest.fn(),
      currentHeadOf: jest.fn(),
      currentHeadOfLocked: jest.fn(),
      financeEmployeeId: jest.fn(),
      superAdminEmployeeId: jest.fn(),
    };
    const notifications = { notifyInApp: jest.fn(), holdForDepartment: jest.fn() };

    async function notifier(): Promise<BudgetNotifierService> {
      const moduleRef = await Test.createTestingModule({
        providers: [
          BudgetNotifierService,
          { provide: BudgetFactsService, useValue: support },
          { provide: NotificationsApi, useValue: notifications },
        ],
      }).compile();

      return moduleRef.get(BudgetNotifierService);
    }

    beforeEach(() => {
      jest.clearAllMocks();
      support.departmentsOf.mockResolvedValue(new Map([['cc-1', 'dep-1']]));
      support.financeEmployeeId.mockResolvedValue('finance');
      support.currentHeadOfLocked.mockResolvedValue(null);
      support.currentHeadOf.mockResolvedValue(null);
      support.superAdminEmployeeId.mockResolvedValue('super-admin');
    });

    const version = {
      id: 'version-1',
      organizationId: 'org-1',
      costCenterId: 'cc-1',
      year: 2027,
      sentAt: new Date('2026-10-28T03:00:00Z'),
    } as unknown as VersionRecord;

    it('tells the Super Admin, once for the stretch, that a version waits for a spending approver, with ids and the year only', async () => {
      await (await notifier()).versionWaiting(tx, version, 'role:change-1');

      expect(notifications.notifyInApp).toHaveBeenCalledTimes(1);
      expect(notifications.notifyInApp).toHaveBeenCalledWith(tx, {
        organizationId: 'org-1',
        recipientEmployeeId: 'super-admin',
        code: 'CONTROLLED_WAIT_ALERT',
        subject: { type: 'BUDGET_VERSION', id: 'version-1' },
        params: {
          versionId: 'version-1',
          costCenterId: 'cc-1',
          year: 2027,
          waitingReason: 'NO_SPENDING_APPROVER',
          configurationHint: 'CONFIGURE_SPENDING_APPROVER',
        },
        eventKey: 'CONTROLLED_WAIT_ALERT:BUDGET_VERSION:version-1:role:change-1',
      });
    });

    it('tells the Super Admin of a version sent while nobody who works holds the role, and nobody else', async () => {
      await (await notifier()).versionSent(tx, version, 'finance', null);

      expect(notifications.notifyInApp).toHaveBeenCalledTimes(1);
      expect(notifications.notifyInApp).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          recipientEmployeeId: 'super-admin',
          code: 'CONTROLLED_WAIT_ALERT',
          eventKey: `CONTROLLED_WAIT_ALERT:BUDGET_VERSION:version-1:sent:${version.sentAt?.getTime()}`,
        }),
      );
    });

    it('tells the spending approver, and no alert, of a version sent while somebody holds the role', async () => {
      await (await notifier()).versionSent(tx, version, 'finance', 'approver');

      expect(notifications.notifyInApp).toHaveBeenCalledTimes(1);
      expect(notifications.notifyInApp).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ recipientEmployeeId: 'approver', code: 'BUDGET_VERSION_AWAITING_DECISION' }),
      );
    });

    it('keeps the work of a returned proposal for the first head, reading the head under the department lock only', async () => {
      await (await notifier()).proposalReturned(tx, proposal, TODAY);

      expect(support.currentHeadOfLocked).toHaveBeenCalledWith('dep-1', TODAY, tx);
      expect(support.currentHeadOf).not.toHaveBeenCalled();
      expect(notifications.holdForDepartment).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ departmentId: 'dep-1', code: 'BUDGET_PROPOSAL_TASK_ASSIGNED' }),
      );
    });

    it('tells the head the lock found, and keeps nothing, when somebody was named while the writer waited', async () => {
      support.currentHeadOfLocked.mockResolvedValue('new-head');

      await (await notifier()).proposalReturned(tx, proposal, TODAY);

      expect(notifications.holdForDepartment).not.toHaveBeenCalled();
      expect(notifications.notifyInApp).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ recipientEmployeeId: 'new-head', code: 'BUDGET_PROPOSAL_TASK_ASSIGNED' }),
      );
    });

    it('keeps the notice of a proposal closed at year end for the first head, reading the head under the department lock only', async () => {
      await (await notifier()).proposalClosedYearEnd(tx, proposal, TODAY);

      expect(support.currentHeadOfLocked).toHaveBeenCalledWith('dep-1', TODAY, tx);
      expect(support.currentHeadOf).not.toHaveBeenCalled();
      expect(notifications.holdForDepartment).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ departmentId: 'dep-1', code: 'BUDGET_PROPOSAL_CLOSED_YEAR_END' }),
      );
    });

    it('tells the head of a proposal closed at year end directly when the lock finds one, and keeps nothing', async () => {
      support.currentHeadOfLocked.mockResolvedValue('new-head');

      await (await notifier()).proposalClosedYearEnd(tx, proposal, TODAY);

      expect(notifications.holdForDepartment).not.toHaveBeenCalled();
      expect(notifications.notifyInApp).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ recipientEmployeeId: 'new-head', code: 'BUDGET_PROPOSAL_CLOSED_YEAR_END' }),
      );
    });
  });

  describe('BudgetFactsService.currentHeadOfLocked', () => {
    const organization = { lockDepartmentShared: jest.fn(), getDepartmentHeads: jest.fn() };

    async function support(): Promise<BudgetFactsService> {
      const moduleRef = await Test.createTestingModule({
        providers: [
          BudgetFactsService,
          { provide: OrganizationReadApi, useValue: organization },
          { provide: FinanceApi, useValue: {} },
          { provide: OperatingParametersApi, useValue: {} },
          { provide: IdentityAccessApi, useValue: {} },
          { provide: CatalogApi, useValue: {} },
        ],
      }).compile();

      return moduleRef.get(BudgetFactsService);
    }

    beforeEach(() => {
      jest.clearAllMocks();
      organization.lockDepartmentShared.mockResolvedValue({ id: 'dep-1' });
      organization.getDepartmentHeads.mockResolvedValue(new Map([['dep-1', { employeeId: 'head-1' }]]));
    });

    it('takes the department FOR SHARE in the given transaction BEFORE it reads who heads it', async () => {
      const head = await (await support()).currentHeadOfLocked('dep-1', TODAY, tx);

      expect(head).toBe('head-1');
      expect(organization.lockDepartmentShared).toHaveBeenCalledWith(tx, 'dep-1');
      expect(organization.getDepartmentHeads).toHaveBeenCalledWith(['dep-1'], TODAY, tx);
      expect(organization.lockDepartmentShared.mock.invocationCallOrder[0]).toBeLessThan(
        organization.getDepartmentHeads.mock.invocationCallOrder[0],
      );
    });

    it('answers null when nobody heads the department, still after the lock', async () => {
      organization.getDepartmentHeads.mockResolvedValue(new Map());

      expect(await (await support()).currentHeadOfLocked('dep-1', TODAY, tx)).toBeNull();
      expect(organization.lockDepartmentShared).toHaveBeenCalledTimes(1);
    });
  });
});
