import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditService } from '../../audit/audit.service';
import { LicensingService } from '../../licensing/licensing.service';
import { OrganizationService } from '../../organization/organization.service';
import { personnelSystemAuditEvent } from '../mappers/personnel-audit-event';
import { PersonnelFileHooks, type PersonnelFileEvent } from '../personnel-file-hooks';

/** How many accounts the reminder names; the rest are counted. */
const ACCOUNTS_NAMED = 50;

/**
 * Tells the IT Admin which service accounts need a new person before a transfer or a departure takes effect (`US-03-08` AC-1, `US-03-01`
 * AC-9, `US-03-04` AC-17): when the file is recorded, and again when its day moves, the audit event `SERVICE_ACCOUNT_DUTY.OPENED` names
 * the accounts and the day. It never holds the record back (`QĐ-75e`, `QĐ-66i`): a person with no service account gets no event, and a
 * cancelled file stops the reminder by itself, because the list of duties reads only files that wait. The event is the point the
 * notification channel takes the reminder from (`g4-notification-delivery`).
 */
@Injectable()
export class ServiceAccountDutyHook implements OnModuleInit {
  constructor(
    private readonly hooks: PersonnelFileHooks,
    private readonly licensing: LicensingService,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.hooks.register({
      onRecorded: (tx, event) => this.remind(tx, event),
      onDueChanged: (tx, event) => this.remind(tx, event),
    });
  }

  private async remind(tx: DbTx, event: PersonnelFileEvent): Promise<void> {
    const duties = await this.licensing.listServiceAccountDuties([event.employeeId], tx);
    const organization = await this.organization.getOrganization(tx);
    if (duties.length === 0 || !organization) return;

    await this.audit.record(
      tx,
      personnelSystemAuditEvent(
        organization.id,
        'SERVICE_ACCOUNT_DUTY.OPENED',
        'Employee',
        event.employeeId,
        event.fileId,
        null,
        {
          employeeId: event.employeeId,
          fileKind: event.fileKind,
          fileId: event.fileId,
          dueOn: event.dueOn,
          count: duties.length,
          assignmentIds: duties.slice(0, ACCOUNTS_NAMED).map((duty) => duty.assignmentId),
        },
      ),
    );
  }
}
