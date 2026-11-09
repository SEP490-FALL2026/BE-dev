import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { handoverAlert, type HandoverStage } from '../licensing-alerts.policy';
import { LicensingAlerts } from '../licensing-alerts.service';
import { HandoverCaseFacts } from './handover-case-facts.service';
import { HandoverConfirmerResolver } from './handover-confirmer.service';
import type { DutyRecord } from './handover.repo';

/**
 * The inbox alerts of a handover that waits for its confirmation (`US-12-15` line 12, `US-03-09` AC-3, `US-07-09` AC-17, AC-18): the
 * person the duty falls to now and the IT Admin in charge of its department, when the duty opens or falls to someone new (`DUE`) and
 * when its deadline passes (`OVERDUE`). The person is read from the organization at that moment, never kept: a department with no
 * head, or a head who leaves with no successor, has nobody told in the place of the head, and a head named later is the one asked.
 */
@Injectable()
export class HandoverAlertService {
  constructor(
    private readonly alerts: LicensingAlerts,
    private readonly resolver: HandoverConfirmerResolver,
    private readonly facts: HandoverCaseFacts,
  ) {}

  /** Tells the people of the duty in the caller's transaction; returns how many notices were new. */
  async tell(tx: DbTx, stage: HandoverStage, duty: DutyRecord, now: Date = new Date()): Promise<number> {
    const today = await this.facts.today(now, tx);
    const confirmer = (await this.resolver.resolve([duty], today, tx)).get(duty.id)?.confirmer.employeeId ?? null;
    const itAdmin = await this.alerts.itAdminOfDepartment(duty.departmentId, tx);

    return this.alerts.tell(tx, duty.organizationId, [confirmer, itAdmin], handoverAlert(stage, duty));
  }
}
