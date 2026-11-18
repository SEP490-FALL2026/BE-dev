import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { personnelAuditEvent } from '../personnel-audit-event.mapper';
import { userActor } from '../public/personnel.types';
import { ItHandoverRepo } from './it-handover.repo';
import type { HandoverSource } from './it-handover.types';

const AUDIT = {
  OFFBOARDING_CASE: { action: 'OFFBOARDING_CASE.IT_ADMIN_HANDED_OVER', resource: 'OffboardingCase' },
  DEPARTMENT_TRANSFER: { action: 'DEPARTMENT_TRANSFER.IT_ADMIN_HANDED_OVER', resource: 'DepartmentTransfer' },
} as const;

/**
 * What a hand-over of an IT Admin who leaves leaves behind it besides the move itself (`QĐ-110j`, SPEC P5): the line in the log of a departure
 * (a transfer has no such log), the event of the Audit Trail that names who handed what to whom and for which file, and the notice to the IT Admin
 * who took it. All in the transaction of the hand-over.
 */
@Injectable()
export class ItHandoverTellingService {
  constructor(
    private readonly items: ItHandoverRepo,
    private readonly audit: AuditApi,
    private readonly notifier: PersonnelNotifier,
  ) {}

  async tell(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    source: HandoverSource,
    moved: { employeeId: string; toEmployeeId: string; subscriptions: number; applications: number },
  ): Promise<void> {
    const after = {
      employeeId: moved.employeeId,
      toItAdminEmployeeId: moved.toEmployeeId,
      subscriptions: moved.subscriptions,
      applications: moved.applications,
    };
    if (source.kind === 'OFFBOARDING_CASE')
      await this.items.insertCaseChange(tx, {
        caseId: source.id,
        detail: {
          toItAdminEmployeeId: moved.toEmployeeId,
          subscriptions: moved.subscriptions,
          applications: moved.applications,
        },
        changedByAppUserId: actor.appUserId,
      });
    const audit = AUDIT[source.kind];
    await this.audit.record(
      tx,
      personnelAuditEvent(userActor(actor), organizationId, audit.action, audit.resource, source.id, null, after),
    );
    await this.notifier.itHandoverReceived(tx, {
      organizationId,
      source,
      fromEmployeeId: moved.employeeId,
      toEmployeeId: moved.toEmployeeId,
      subscriptions: moved.subscriptions,
      applications: moved.applications,
    });
  }
}
