import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { AssignmentEndService } from '../assignment/assignment-end.service';
import { licensingAuditEvent } from '../licensing-audit-event.mapper';
import type { OperatorAuditActor } from '../public/licensing-handover.types';
import { confirmationCovers, requirementOf, takesOver, type SourceFact } from './handover-confirmer.policy';
import { HandoverRepo, type DutyRecord } from './handover.repo';

/** What the seat is owed and where the person who confirms is looked for. */
export interface IssueInput {
  assignmentId: string;
  employeeId: string;
  facts: readonly SourceFact[];
  dataLossOnRemoval: boolean;
  noticeText: string | null;
  caseRefId: string | null;
  departmentId: string | null;
  leaverIsHead: boolean;
  resolveOn: BusinessDate | null;
  dueOn: BusinessDate;
  /** The controlled procedure, when it is who asks: the events are audited as that operator and not as `actor`. */
  operator?: OperatorAuditActor;
}

export type Issued =
  | { outcome: 'OPENED'; duty: DutyRecord }
  | { outcome: 'REUSED'; duty: DutyRecord | null }
  | { outcome: 'NOT_REQUIRED' };

/**
 * Makes the duty a seat is owed, once however many reasons ask for it (`US-07-09` AC-11, AC-12, AC-23, `QĐ-64a`): a duty that
 * still waits is kept, and given to the head who decided when the IT Admin had it; a confirmation of the right role already written
 * is relied on, so nobody is asked twice; a seat that needs none gets none. The seat is locked first, in the order of whoever works
 * a revocation (the subscription, then the assignment), so two sources never make two duties.
 */
@Injectable()
export class HandoverIssueService {
  constructor(
    private readonly repo: HandoverRepo,
    private readonly ending: AssignmentEndService,
    private readonly organization: OrganizationApi,
    private readonly audit: AuditApi,
  ) {}

  async ensure(tx: DbTx, actor: AuthenticatedPrincipal, input: IssueInput): Promise<Issued> {
    const required = requirementOf(input.facts, input.dataLossOnRemoval);
    if (!required) return { outcome: 'NOT_REQUIRED' };

    await this.ending.lock(tx, input.assignmentId);
    const organization = await this.organization.getOrganization(tx);
    if (!organization) throw new Error('A handover was opened before installation');

    const open = await this.repo.lockOpenOf(tx, input.assignmentId);
    if (open) {
      if (!takesOver({ role: open.confirmerRole }, required)) return { outcome: 'REUSED', duty: open };
      await this.repo.retarget(tx, open.id, {
        source: required.source,
        role: required.role,
        confirmerEmployeeId: required.fixedEmployeeId,
        departmentId: input.departmentId ?? open.departmentId,
        leaverIsHead: input.leaverIsHead,
        resolveOn: input.resolveOn,
      });
      await this.audit.record(
        tx,
        licensingAuditEvent(
          actor,
          organization.id,
          'HANDOVER_DUTY.ROLE_CHANGED',
          'HandoverDuty',
          open.id,
          { role: open.confirmerRole, source: open.source },
          { role: required.role, source: required.source, confirmerEmployeeId: required.fixedEmployeeId },
          input.operator,
        ),
      );

      return { outcome: 'REUSED', duty: await this.repo.find(open.id, tx) };
    }

    const covered = (await this.repo.confirmedOf(tx, input.assignmentId)).find(
      (duty) =>
        duty.confirmedRole !== null &&
        duty.confirmedByEmployeeId !== null &&
        confirmationCovers({ role: duty.confirmedRole, byEmployeeId: duty.confirmedByEmployeeId }, required),
    );
    if (covered) return { outcome: 'REUSED', duty: covered };

    const duty = await this.repo.insert(tx, {
      organizationId: organization.id,
      assignmentId: input.assignmentId,
      employeeId: input.employeeId,
      source: required.source,
      caseRefId: input.caseRefId,
      departmentId: input.departmentId,
      leaverIsHead: input.leaverIsHead,
      resolveOn: input.resolveOn,
      confirmerRole: required.role,
      confirmerEmployeeId: required.fixedEmployeeId,
      dataLoss: input.dataLossOnRemoval,
      noticeText: input.noticeText?.trim() || null,
      dueOn: input.dueOn,
      createdByAppUserId: actor.appUserId,
    });
    // The audit event says who owes what and until when, never the notice text.
    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        organization.id,
        'HANDOVER_DUTY.OPENED',
        'HandoverDuty',
        duty.id,
        null,
        {
          assignmentId: duty.assignmentId,
          employeeId: duty.employeeId,
          source: duty.source,
          role: duty.confirmerRole,
          confirmerEmployeeId: duty.confirmerEmployeeId,
          departmentId: duty.departmentId,
          dueOn: duty.dueOn,
          dataLoss: duty.dataLoss,
          caseRefId: duty.caseRefId,
        },
        input.operator,
      ),
    );

    return { outcome: 'OPENED', duty };
  }
}
