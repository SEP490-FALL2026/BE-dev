import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../../audit/public/audit.api';
import { OrganizationApi } from '../../../organization/public/organization.api';
import { personnelSystemAuditEvent } from '../../mappers/personnel-audit-event.mapper';
import {
  OffboardingWarningContributions,
  PersonnelFileHookContributions,
  type PersonnelFileEvent,
} from '../../public/personnel.extension-points';
import { OFFBOARDING_OPEN_REQUESTS } from '../../public/personnel.types';
import { OpenRequestsService } from './open-requests.service';

/**
 * Tells the IT Admin which requests and grants of a person who leaves are still open (`US-03-04` AC-24): beside the case as a warning (the
 * count is the requests plus the grants not finished, read when the case is shown) and, when the departure is recorded, in the audit event
 * `OFFBOARDING_CASE.OPEN_REQUESTS_FOUND` with how many of each, which is where the reminder to the IT Admin is taken from. It never holds
 * the record back and never changes a request or a task: closing them is the IT Admin's act, one at a time, after the person has left.
 */
@Injectable()
export class OpenRequestsSource implements OnModuleInit {
  constructor(
    private readonly warnings: OffboardingWarningContributions,
    private readonly hooks: PersonnelFileHookContributions,
    private readonly open: OpenRequestsService,
    private readonly organization: OrganizationApi,
    private readonly audit: AuditApi,
  ) {}

  onModuleInit(): void {
    this.warnings.add(OFFBOARDING_OPEN_REQUESTS, {
      code: OFFBOARDING_OPEN_REQUESTS,
      countFor: async (employeeId: string, tx?: DbTx) => {
        const counted = await this.open.countsOf(employeeId, tx);

        return counted.requests + counted.grantTasks;
      },
    });
    this.hooks.add('personnel.open-requests', { onRecorded: (tx, event) => this.remind(tx, event) });
  }

  private async remind(tx: DbTx, event: PersonnelFileEvent): Promise<void> {
    if (event.fileKind !== 'OFFBOARDING') return;
    const counted = await this.open.countsOf(event.employeeId, tx);
    const organization = await this.organization.getOrganization(tx);
    if (counted.requests + counted.grantTasks === 0 || !organization) return;

    await this.audit.record(
      tx,
      personnelSystemAuditEvent(
        organization.id,
        'OFFBOARDING_CASE.OPEN_REQUESTS_FOUND',
        'OffboardingCase',
        event.fileId,
        event.fileId,
        null,
        {
          employeeId: event.employeeId,
          audience: 'IT_ADMIN',
          openRequests: counted.requests,
          openGrantTasks: counted.grantTasks,
        },
      ),
    );
  }
}
