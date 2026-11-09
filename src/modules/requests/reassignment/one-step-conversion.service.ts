import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AuditApi } from '../../audit/public/audit.api';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { StepReassignmentRepo } from '../step-routing/step-reassignment.repo';
import { SpendRoutingService } from '../spend/spend-routing.service';
import { shouldConvertOneStep } from '../step-routing/one-step-conversion.policy';

/** Marking runs in the organization transaction; completing uses a separate transaction and the standard budget check. */
@Injectable()
export class OneStepConversionService {
  constructor(private readonly runner: TransactionRunner, private readonly requests: AccessRequestRepo,
    private readonly repo: StepReassignmentRepo, private readonly organization: OrganizationReadApi,
    private readonly spending: SpendRoutingService, private readonly audit: AuditApi) {}

  async markForDepartment(tx: DbTx, departmentId: string, now: Date): Promise<number> {
    await this.organization.lockDepartmentShared(tx, departmentId);
    const today = await this.organization.businessToday(now, tx);
    const head = (await this.organization.getDepartmentHeads([departmentId], today, tx)).get(departmentId);
    const person = head ? await this.organization.getEmployee(head.employeeId, tx) : null;
    const successor = await this.organization.nextHeadPeriodOf(departmentId, today, tx);
    if (person?.status === 'ACTIVE' || successor !== null) return 0;
    let marked = 0;
    for (const id of await this.repo.conversionIds(departmentId, tx)) {
      const request = await this.requests.lockById(tx, id);
      if (await this.repo.hasOpenSpend(tx, id)) continue;
      if (!request || !shouldConvertOneStep({ paid: request.branch !== 'INTERNAL_FREE', mode: request.routing?.mode ?? 'VIA_HEAD', state: request.state, hasHead: false, successorRecorded: false })) continue;
      await this.repo.markOneStep(tx, id, now);
      await this.audit.record(tx, accessRequestAuditEvent(null, request.organizationId, 'ACCESS_REQUEST.CONVERTED_ONE_STEP', 'ACCESS_REQUEST', id, { requestId: id, oneStepReason: 'HEAD_LEFT' }));
      marked++;
    }
    return marked;
  }

  async markMissingHeads(now: Date): Promise<void> {
    for (const departmentId of await this.repo.conversionDepartmentIds()) {
      await this.runner.run((tx) => this.markForDepartment(tx, departmentId, now));
    }
  }

  pendingIds(): Promise<string[]> { return this.repo.oneStepPendingIds(); }

  async finishPending(id: string, now: Date): Promise<boolean> {
    return this.runner.run(async (tx) => {
      const request = await this.requests.lockById(tx, id);
      if (!request || request.routing?.mode !== 'ONE_STEP' || !['PENDING', 'WAITING_CONTROLLED', 'AWAITING_SPEND_SUBMISSION'].includes(request.state)) return false;
      // A worker that was slower than a second worker does not open a second spend step.
      await this.spending.finishConversion(tx, request, now);
      return true;
    });
  }
}
