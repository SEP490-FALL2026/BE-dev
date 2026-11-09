import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord, PricingRecord } from '../access-request/access-request.types';
import { GroupSupplementService } from '../group-request/group-supplement.service';
import { supplementAuditDetail, type supplementChangeOf } from '../spend/spend-submission.policy';
import { SupplementRepo, type SupplementRecord } from './supplement.repo';

/**
 * Writes a supplementary file (`QĐ-82n`, `US-06-14` AC-13, AC-15): the new price of the request, the line of the plan attached again when
 * the year changed, the file that keeps what it was before and after, the people of a group left out, and the audit event. What was first
 * sent is not touched.
 */
@Injectable()
export class SupplementRecorder {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly supplements: SupplementRepo,
    private readonly groups: GroupSupplementService,
    private readonly audit: AuditApi,
  ) {}

  async record(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    written: {
      reason: string;
      repriced: PricingRecord;
      change: NonNullable<ReturnType<typeof supplementChangeOf>>;
      dropped: readonly string[];
      now: Date;
    },
  ): Promise<SupplementRecord> {
    const { repriced, change, dropped, now } = written;
    await this.requests.setPricing(tx, request.id, repriced);
    const saved = await this.supplements.insert(tx, {
      organizationId: request.organizationId,
      requestId: request.id,
      reason: written.reason,
      changedByEmployeeId: actor.employeeId,
      ...change,
      now,
    });
    await this.groups.drop(tx, actor, request, dropped, written.reason, saved.number, now);
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        'ACCESS_REQUEST.SUPPLEMENT_ADDED',
        'ACCESS_REQUEST',
        request.id,
        supplementAuditDetail(
          request.id,
          {
            number: saved.number,
            beforeExpectedSpendOn: saved.beforeExpectedSpendOn ?? '',
            afterExpectedSpendOn: saved.afterExpectedSpendOn ?? '',
            beforeBudgetYear: saved.beforeBudgetYear ?? 0,
            afterBudgetYear: saved.afterBudgetYear ?? 0,
            beforeAmountMinor: saved.beforeAmountMinor ?? 0n,
            afterAmountMinor: saved.afterAmountMinor ?? 0n,
          },
          dropped,
        ),
      ),
    );

    return saved;
  }
}
