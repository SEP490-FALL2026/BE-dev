import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { LicensingServiceAccountApi } from '../../licensing/public/licensing-service-account.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { personnelSystemAuditEvent } from '../personnel-audit-event.mapper';
import { PersonnelFileHookContributions, type PersonnelFileEvent } from '../public/personnel.extension-points';

/** How many accounts the reminder names; the rest are counted. */
const ACCOUNTS_NAMED = 50;

/**
 * Tells the IT Admin which service accounts need a new person before a transfer or a departure takes effect (`US-03-08` AC-1, `US-03-01`
 * AC-9, `US-03-04` AC-17): when the file is recorded, and again when its day moves, the audit event `SERVICE_ACCOUNT_DUTY.OPENED` names
 * the accounts and the day. By its rules it never holds the record back (`QĐ-75e`, `QĐ-66i`): a person with no service account gets no
 * event, and a cancelled file stops the reminder by itself, because the list of duties reads only files that wait. (A failure of the
 * hook itself, a bug or a statement the database refuses, is not a rule: it rolls the record back like any failure inside the
 * transaction.) The event is the point the notification channel takes the reminder from (`g4-notification-delivery`).
 */
@Injectable()
export class ServiceAccountDutyHook implements OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [PersonnelFileHookContributions] as const;

  constructor(
    private readonly hooks: PersonnelFileHookContributions,
    private readonly licensingServiceAccounts: LicensingServiceAccountApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
  ) {}

  onModuleInit(): void {
    this.hooks.add('personnel.service-account-duty', {
      onRecorded: (tx, event) => this.remind(tx, event),
      onDueChanged: (tx, event) => this.remind(tx, event),
    });
  }

  private async remind(tx: DbTx, event: PersonnelFileEvent): Promise<void> {
    const duties = await this.licensingServiceAccounts.listServiceAccountDuties([event.employeeId], tx);
    const organization = await this.organizationReads.getOrganization(tx);
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
