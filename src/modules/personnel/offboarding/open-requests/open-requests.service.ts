import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { LicensingApi } from '../../../licensing/public/licensing.api';
import { RequestsApi } from '../../../requests/public/requests.api';
import type { OpenGrantTaskWire, OpenRequestWire } from './open-requests.dto';
import { OffboardingRefusedError } from '../offboarding.errors';
import { OffboardingRepo } from '../offboarding.repo';
import type { Paged } from '../offboarding-view.service';

interface Page {
  page: number;
  pageSize: number;
}

const slice = (page: Page) => ({ skip: (page.page - 1) * page.pageSize, take: page.pageSize });
const paged = <T>(items: T[], total: number, page: Page): Paged<T> => ({
  items,
  pagination: {
    page: page.page,
    pageSize: page.pageSize,
    totalItems: total,
    totalPages: Math.ceil(total / page.pageSize),
  },
});

/**
 * What the IT Admin sees beside the record of a departure of the requests and the grants the person still has open (`US-03-04` AC-24): a
 * page of each, and how many there are. Nothing is changed by reading, and nothing here closes anything: the request is closed by the
 * IT Admin one at a time (`POST /access-requests/{id}/cancellation`), after the person has left. A page costs the same statements
 * whatever its size.
 */
@Injectable()
export class OpenRequestsService {
  constructor(
    private readonly cases: OffboardingRepo,
    private readonly requests: RequestsApi,
    private readonly licensing: LicensingApi,
  ) {}

  /** Throws OffboardingRefusedError (`NOT_FOUND`). */
  async requestsOf(caseId: string, page: Page): Promise<Paged<OpenRequestWire>> {
    const { items, total } = await this.requests.listOpenOfBeneficiary(await this.employeeOf(caseId), slice(page));

    return paged(
      items.map((item) => ({ ...item, submittedAt: item.submittedAt.toISOString() })),
      total,
      page,
    );
  }

  /** Throws OffboardingRefusedError (`NOT_FOUND`). */
  async grantTasksOf(caseId: string, page: Page): Promise<Paged<OpenGrantTaskWire>> {
    const { items, total } = await this.licensing.listOpenGrantTasksOfBeneficiary(
      await this.employeeOf(caseId),
      slice(page),
    );

    return paged(
      items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
      total,
      page,
    );
  }

  /** How many of each the person has open, for the audit event of the record and the warning beside the case. */
  async countsOf(employeeId: string, tx?: DbTx): Promise<{ requests: number; grantTasks: number }> {
    const [requests, grantTasks] = await Promise.all([
      this.requests.listOpenOfBeneficiary(employeeId, { skip: 0, take: 0 }, tx),
      this.licensing.listOpenGrantTasksOfBeneficiary(employeeId, { skip: 0, take: 0 }, tx),
    ]);

    return { requests: requests.total, grantTasks: grantTasks.total };
  }

  private async employeeOf(caseId: string): Promise<string> {
    const record = await this.cases.find(caseId);
    if (!record) throw new OffboardingRefusedError('NOT_FOUND');

    return record.employeeId;
  }
}
