import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { GroupSupplementDropRefusedError } from './group-request.errors';
import { pricedPeople } from './group-request.types';
import { GroupResolutionService } from './group-resolution.service';
import { RequestLineRepo } from './request-line.repo';
import { RequestOutcomeService } from '../outcome/request-outcome.service';
import { SupplementDropRepo } from './supplement-drop.repo';

/**
 * The people a head leaves out of a request for a group in a supplementary file (`US-06-14` AC-13): while the request waits in the
 * queue of the head, a person whose need is confirmed may be dropped with a reason; what the request costs is made again for those who
 * remain, and the file keeps the people, the amounts and the days before and after. The head sends it on afterwards and the check runs
 * again as a whole. A refusal changes nothing.
 */
@Injectable()
export class GroupSupplementService {
  constructor(
    private readonly lines: RequestLineRepo,
    private readonly drops: SupplementDropRepo,
    private readonly resolution: GroupResolutionService,
    private readonly audit: AuditApi,
    private readonly outcomes: RequestOutcomeService,
  ) {}

  /**
   * Judges the people the head wants left out: each is a line of the request whose need is confirmed, and one is left. Throws
   * GroupSupplementDropRefusedError.
   */
  check(request: AccessRequestRecord, employeeIds: readonly string[]): string[] {
    if (employeeIds.length === 0) return [];
    if (request.type !== 'GROUP_GRANT') throw new GroupSupplementDropRefusedError('DROP_NOT_FOR_GROUP');

    const dropped = [...new Set(employeeIds)];
    const refused = dropped.filter(
      (id) => !request.lines.some((line) => line.employeeId === id && line.state === 'NEED_CONFIRMED'),
    );
    if (refused.length > 0) throw new GroupSupplementDropRefusedError('LINE_NOT_DROPPABLE', refused);

    const remaining = pricedPeople(request.lines.map((line) => line.state)) - dropped.length;
    if (remaining < 1) throw new GroupSupplementDropRefusedError('CANNOT_DROP_LAST_LINE');

    return dropped;
  }

  /** The request as it is once the people are left out, for what it costs then. */
  withoutPeople(request: AccessRequestRecord, employeeIds: readonly string[]): AccessRequestRecord {
    return {
      ...request,
      lines: request.lines.map((line) =>
        employeeIds.includes(line.employeeId) ? { ...line, state: 'DROPPED' as const } : line,
      ),
    };
  }

  /** Leaves the people out: their lines end, the file keeps who, and the request follows what is left. */
  async drop(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    employeeIds: readonly string[],
    reason: string,
    number: number,
    now: Date,
  ): Promise<void> {
    if (employeeIds.length === 0) return;
    await this.lines.lock(tx, request.id, employeeIds);
    for (const employeeId of employeeIds) {
      await this.lines.move(tx, request.id, employeeId, {
        state: 'DROPPED',
        endedAt: now,
        endedByEmployeeId: actor.employeeId,
        endReason: reason,
      });
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.LINE_DROPPED',
          'ACCESS_REQUEST',
          request.id,
          {
            requestId: request.id,
            beneficiaryEmployeeId: employeeId,
            droppedByEmployeeId: actor.employeeId,
            requesterEmployeeId: request.requesterEmployeeId,
            reason,
            supplementNumber: number,
          },
        ),
      );
      // The line of a person the head left out of the file ended for them without a grant (F43).
      await this.outcomes.ended(tx, request, [employeeId], now);
    }
    await this.drops.insertMany(tx, request.id, number, employeeIds);
    await this.resolution.resolve(tx, actor, request.id, now);
  }

  /** The people each file left out, by number of the file. */
  droppedBy(requestId: string, numbers: readonly number[]): Promise<Map<number, string[]>> {
    return this.drops.of(requestId, numbers);
  }
}
