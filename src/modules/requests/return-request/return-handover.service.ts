import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { ReturnRequestRefusedError } from './return-request.errors';
import { handoverConfirmRefusal, handoverOnTime, mayReadReturn } from './return-request.policy';
import { ReturnRequestRepo, type ReturnRequestRecord } from './return-request.repo';

/** The person who triggered the return says that the handover of the data is done (`US-05-13` AC-6, `QĐ-62f`). */
@Injectable()
export class ReturnHandoverService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly returns: ReturnRequestRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
  ) {}

  /** Throws ReturnRequestRefusedError. */
  async confirmHandover(actor: AuthenticatedPrincipal, id: string): Promise<ReturnRequestRecord> {
    return this.runner.run(async (tx) => {
      const now = new Date();
      const found = await this.returns.lockById(tx, id);
      const headed = await this.organizationReads.getHeadedDepartment(
        actor.employeeId,
        await this.organizationReads.businessToday(now, tx),
      );
      if (
        !found ||
        !mayReadReturn({
          actorEmployeeId: actor.employeeId,
          roles: actor.roles,
          holderEmployeeId: found.holderEmployeeId,
          requestedByEmployeeId: found.requestedByEmployeeId,
          returnDepartmentId: found.departmentId,
          actorHeadedDepartmentId: headed?.departmentId ?? null,
        })
      ) {
        throw new ReturnRequestRefusedError('NOT_FOUND');
      }
      const refusal = handoverConfirmRefusal(actor.employeeId, found);
      if (refusal) throw new ReturnRequestRefusedError(refusal);

      await this.returns.confirmHandover(tx, found.id, actor.employeeId, now);
      const today = await this.organizationReads.businessToday(now, tx);
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          found.organizationId,
          'RETURN_REQUEST.HANDOVER_CONFIRMED',
          'RETURN_REQUEST',
          found.id,
          {
            returnRequestId: found.id,
            assignmentId: found.assignmentId,
            confirmedByEmployeeId: actor.employeeId,
            onTime: handoverOnTime(found.handoverDueOn, today),
          },
        ),
      );

      const confirmed = await this.returns.findById(found.id, tx);
      if (!confirmed) throw new Error(`The return ${found.id} was not found after its handover was confirmed.`);

      return confirmed;
    });
  }
}
