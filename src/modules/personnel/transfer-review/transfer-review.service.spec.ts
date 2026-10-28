import { Test } from '@nestjs/testing';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditService } from '../../audit/audit.service';
import { LicensingService } from '../../licensing/licensing.service';
import { OperatingParametersService } from '../../operating-parameters/operating-parameters.service';
import { OrganizationService } from '../../organization/organization.service';
import { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { TransferReviewService } from './transfer-review.service';
import { TransferReviewRepo } from './transfer-review.repo';

const tx = { name: 'tx' } as unknown as DbTx;
const review = {
  id: 'review-1',
  organizationId: 'org-1',
  employeeId: 'emp-1',
  departmentId: 'dep-1',
  dueOn: '2026-11-05',
};

/**
 * `T-11` (review, race of a kept notice and the assignment of a first head): the notice of the deadline of a review is told to the head
 * of the department, or kept for the first one. The department is taken `FOR SHARE` before the head is read, so the assignment of a
 * first head (department `FOR UPDATE`, hands over what was kept before it commits) cannot interleave with this writer.
 */
describe('TransferReviewService.tellHead', () => {
  const organization = { businessToday: jest.fn(), lockDepartmentShared: jest.fn(), getDepartmentHeads: jest.fn() };
  const notifier = { reviewDue: jest.fn() };

  async function service(): Promise<TransferReviewService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TransferReviewService,
        { provide: TransferReviewRepo, useValue: {} },
        { provide: LicensingService, useValue: {} },
        { provide: OperatingParametersService, useValue: {} },
        { provide: OrganizationService, useValue: organization },
        { provide: AuditService, useValue: {} },
        { provide: PersonnelNotifier, useValue: notifier },
      ],
    }).compile();

    return moduleRef.get(TransferReviewService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    organization.businessToday.mockResolvedValue('2026-10-28');
    organization.lockDepartmentShared.mockResolvedValue({ id: 'dep-1' });
    organization.getDepartmentHeads.mockResolvedValue(new Map());
  });

  it('takes the department FOR SHARE in the transaction before it reads who heads it', async () => {
    await (await service()).tellHead(tx, review);

    expect(organization.lockDepartmentShared).toHaveBeenCalledWith(tx, 'dep-1');
    expect(organization.getDepartmentHeads).toHaveBeenCalledWith(['dep-1'], '2026-10-28', tx);
    expect(organization.lockDepartmentShared.mock.invocationCallOrder[0]).toBeLessThan(
      organization.getDepartmentHeads.mock.invocationCallOrder[0],
    );
  });

  it('tells the head the read found, and lets the notifier keep the notice for the first head when there is none', async () => {
    const heads = await service();
    organization.getDepartmentHeads.mockResolvedValueOnce(new Map([['dep-1', { employeeId: 'head-1' }]]));

    await heads.tellHead(tx, review);
    await heads.tellHead(tx, review);

    expect(notifier.reviewDue).toHaveBeenNthCalledWith(1, tx, expect.objectContaining({ headEmployeeId: 'head-1' }));
    expect(notifier.reviewDue).toHaveBeenNthCalledWith(2, tx, expect.objectContaining({ headEmployeeId: null }));
  });
});
