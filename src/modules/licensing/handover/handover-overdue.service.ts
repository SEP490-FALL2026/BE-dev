import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditService } from '../../audit/audit.service';
import { HandoverCaseFacts } from './handover-case-facts.service';
import { HandoverRepo } from './handover.repo';

/** How many duties one pass reminds about; the next pass takes the rest. */
const BATCH = 200;

/**
 * Tells, once for each duty, that the deadline of a handover passed without the confirmation (`US-03-09` AC-3, `US-07-09` AC-17): the
 * audit event is the point where the reminder to the person who confirms and the alert to the IT Admin are taken from. The mark and
 * the event are written together, so a duty is told once however many instances run the sweep.
 */
@Injectable()
export class HandoverOverdueService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: HandoverRepo,
    private readonly facts: HandoverCaseFacts,
    private readonly audit: AuditService,
  ) {}

  /** Returns how many duties were told in this pass. */
  async noticeOverdue(now: Date = new Date()): Promise<number> {
    const today = await this.facts.today(now);
    const overdue = await this.repo.listOverdueUnnoticed(today, BATCH);
    let told = 0;
    for (const duty of overdue) {
      const marked = await this.runner.run(async (tx) => {
        if (!(await this.repo.markOverdueNoticed(tx, duty.id, now))) return false;
        await this.audit.record(tx, {
          organizationId: duty.organizationId,
          actorKind: 'SYSTEM',
          action: 'HANDOVER_DUTY.OVERDUE',
          resourceType: 'HandoverDuty',
          resourceId: duty.id,
          before: null,
          after: {
            assignmentId: duty.assignmentId,
            employeeId: duty.employeeId,
            role: duty.confirmerRole,
            dueOn: duty.dueOn,
            departmentId: duty.departmentId,
          },
          correlationId: duty.id,
        });

        return true;
      });
      if (marked) told += 1;
    }

    return told;
  }
}
