import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { DevicesApi } from '../../devices/public/devices.api';
import { RequestsApi } from '../../requests/public/requests.api';
import { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { personnelSystemAuditEvent } from '../personnel-audit-event.mapper';
import { superAdminToMarkLeft } from './block-moment.policy';
import { BlockMomentRepo, type OpenDeparture } from './block-moment.repo';

/** The moment the access of a person is blocked, as the effects need it. */
export interface BlockMoment {
  /** The first day the person is refused. */
  blockedOn: BusinessDate;
  /** The day the IT Admin has until to take every right away. */
  revocationDueOn: BusinessDate;
  at: Date;
}

/**
 * What the system does at the moment the access of a person who is leaving is blocked (`QĐ-110b`, `QĐ-110d`, SPEC MF2-E), in the transaction
 * of the case: the machines the person registered end (`DEPARTURE_BLOCKED`, the same cause a cancellation after the block takes back), every
 * open request of the person is closed by the system (`ALL_OPEN`: the ones whose grant is being carried out are left to the IT Admin, who is
 * told), the log of the case and the audit trail say it, and the Super Admin and the IT Admin are told. Nothing is revoked and no task is
 * opened: taking the rights away is the IT Admin's, by the deadline of the case.
 */
@Injectable()
export class BlockMomentEffects {
  constructor(
    private readonly devices: DevicesApi,
    private readonly requests: RequestsApi,
    private readonly audit: AuditApi,
    private readonly notifier: PersonnelNotifier,
    private readonly cases: BlockMomentRepo,
  ) {}

  async apply(tx: DbTx, departure: OpenDeparture, moment: BlockMoment): Promise<void> {
    const ended = await this.devices.endRegistrationsOfHolder(tx, {
      employeeId: departure.employeeId,
      end: { at: moment.at },
      cause: 'DEPARTURE_BLOCKED',
    });
    const gone = await this.requests.cancelForBeneficiaryGone(
      tx,
      { kind: 'SYSTEM', correlationId: `offboarding-block:${departure.id}` },
      { employeeId: departure.employeeId, scope: { kind: 'ALL_OPEN' } },
    );
    const detail = {
      blockedOn: moment.blockedOn,
      revocationDueOn: moment.revocationDueOn,
      machinesEnded: ended.registrationIds.length,
      requestsCancelled: gone.cancelled.length,
      requestsToCheck: gone.needsItCheck.length,
    };
    await this.cases.insertAccessBlocked(tx, departure.id, detail);
    await this.audit.record(
      tx,
      personnelSystemAuditEvent(
        departure.organizationId,
        'OFFBOARDING_CASE.ACCESS_BLOCKED',
        'OffboardingCase',
        departure.id,
        `offboarding-block:${departure.id}`,
        null,
        { employeeId: departure.employeeId, state: departure.state, ...detail },
      ),
    );
    await this.notifier.departureAccessBlocked(tx, {
      organizationId: departure.organizationId,
      employeeId: departure.employeeId,
      departmentId: departure.departmentId,
      caseId: departure.id,
      blockedOn: moment.blockedOn,
      revocationDueOn: moment.revocationDueOn,
      markLeft: superAdminToMarkLeft(departure.state),
    });
  }
}
