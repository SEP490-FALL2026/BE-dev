import { HttpStatus } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { RequestPartyEligibilityApi } from '../../identity-access/public/request-party-eligibility.api';
import type { LicensingApi } from '../../licensing/public/licensing.api';
import { EmployeeNotStartedError } from '../../organization/public/organization.errors';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AccessRequestRepo } from '../access-request/access-request.repo';
import type { RequestFactsService } from '../access-request/request-facts.service';
import { toGroupRequestApiException } from '../group-request/group-request.http-errors';
import type { RequestLimitsService } from '../request-limits/request-limits.service';
import { GroupSubmissionFactsService } from './group-submission-facts.service';

describe('GroupSubmissionFactsService.judge', () => {
  it('forwards tx to licensing.getSeatsHeldInPlans', async () => {
    const tx = { name: 'tx' } as unknown as DbTx;
    const organizationReads = {
      getEmployees: jest.fn().mockResolvedValue([
        {
          id: 'emp-1',
          status: 'ACTIVE',
          workEmail: 'e1@example.com',
          employmentType: 'STAFF',
          hireDate: '2025-01-01',
          contractEndDate: null,
        },
      ]),
      getOwningUnits: jest.fn().mockResolvedValue(new Map([['emp-1', { departmentId: 'dept-1', costCenter: null }]])),
      notStartedAmong: jest.fn().mockResolvedValue(new Set()),
      lockEmployeeForShare: jest.fn(),
    };
    const licensing = {
      getSeatsHeldInPlans: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const assessment = {
      assess: jest.fn().mockResolvedValue({
        today: '2026-11-23',
        unit: { departmentId: 'dept-1', costCenter: { id: 'cc-1', code: 'CC-1', status: 'ACTIVE' } },
        target: {
          planId: 'plan-1',
          applicationKind: 'SAAS',
          applicationStatus: 'ACTIVE',
          provisioningType: 'K1',
          seatKind: 'PERSONAL',
        },
        policy: { chain: ['NEED', 'SPEND_APPROVAL'], slaWorkingDays: 2 },
        pricing: { amount: null, nextYearAmount: null },
        routing: { departmentHeadEmployeeId: 'head-1' },
      }),
      priceFor: jest.fn().mockResolvedValue({ amount: null, nextYearAmount: null }),
    };
    const requests = {
      openRequestHolders: jest.fn().mockResolvedValue(new Set()),
    };
    const requestParties = {
      ineligibleAmong: jest.fn().mockResolvedValue(new Map()),
    };
    const limits = {
      judge: jest.fn().mockResolvedValue(new Map()),
    };

    const service = new GroupSubmissionFactsService(
      organizationReads as unknown as OrganizationReadApi,
      licensing as unknown as LicensingApi,
      assessment as unknown as RequestFactsService,
      requests as unknown as AccessRequestRepo,
      requestParties as unknown as RequestPartyEligibilityApi,
      limits as unknown as RequestLimitsService,
    );

    await service.judge(tx, {
      senderEmployeeId: 'head-1',
      planId: 'plan-1',
      termMonths: 3,
      lines: [{ employeeId: 'emp-1' }],
      now: new Date('2026-11-23T00:00:00Z'),
      settings: { slaWorkingDays: 2 },
      limitSettings: {} as never,
      lockPeople: false,
    });

    expect(licensing.getSeatsHeldInPlans).toHaveBeenCalledWith('emp-1', ['plan-1'], { skip: 0, take: 1 }, tx);
  });

  it('rejects with EmployeeNotStartedError when any line employee has only a future placement', async () => {
    const tx = { name: 'tx' } as unknown as DbTx;
    const organizationReads = {
      getEmployees: jest.fn().mockResolvedValue([]),
      getOwningUnits: jest.fn().mockResolvedValue(new Map()),
      notStartedAmong: jest.fn().mockResolvedValue(new Set(['emp-future'])),
      lockEmployeeForShare: jest.fn(),
    };
    const service = new GroupSubmissionFactsService(
      organizationReads as unknown as OrganizationReadApi,
      { getSeatsHeldInPlans: jest.fn() } as unknown as LicensingApi,
      {
        assess: jest.fn().mockResolvedValue({
          today: '2026-11-23',
          unit: { departmentId: 'dept-1', costCenter: { id: 'cc-1', code: 'CC-1', status: 'ACTIVE' } },
          target: {
            planId: 'plan-1',
            applicationKind: 'SAAS',
            applicationStatus: 'ACTIVE',
            provisioningType: 'K1',
            seatKind: 'PERSONAL',
          },
          policy: { chain: ['NEED', 'SPEND_APPROVAL'], slaWorkingDays: 2 },
          pricing: { amount: null, nextYearAmount: null },
          routing: { departmentHeadEmployeeId: 'head-1' },
        }),
      } as unknown as RequestFactsService,
      { openRequestHolders: jest.fn() } as unknown as AccessRequestRepo,
      { ineligibleAmong: jest.fn() } as unknown as RequestPartyEligibilityApi,
      { judge: jest.fn() } as unknown as RequestLimitsService,
    );

    await expect(
      service.judge(tx, {
        senderEmployeeId: 'head-1',
        planId: 'plan-1',
        termMonths: 3,
        lines: [{ employeeId: 'emp-future' }],
        now: new Date('2026-11-23T00:00:00Z'),
        settings: { slaWorkingDays: 2 },
        limitSettings: {} as never,
        lockPeople: false,
      }),
    ).rejects.toBeInstanceOf(EmployeeNotStartedError);
    expect(organizationReads.notStartedAmong).toHaveBeenCalledWith(['emp-future'], '2026-11-23', tx);
  });

  it('maps EmployeeNotStartedError in group request mapper to 409 EMPLOYEE.NOT_STARTED', () => {
    const mapped = toGroupRequestApiException(new EmployeeNotStartedError('emp-future')) as ApiException;

    expect(mapped).toBeInstanceOf(ApiException);
    expect(mapped.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(mapped.getResponse()).toMatchObject({ code: 'EMPLOYEE.NOT_STARTED' });
  });
});
