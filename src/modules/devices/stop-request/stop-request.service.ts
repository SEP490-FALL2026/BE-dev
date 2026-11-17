import { Injectable } from '@nestjs/common';
import { addDays, businessDateAt } from '../../../core/business-date';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { byUser, devicesEvent } from '../devices-audit-event.mapper';
import { DeviceRegistrationEndedError, DeviceRegistrationNotFoundError } from '../registry/registry.errors';
import { RegistryRepo } from '../registry/registry.repo';
import { DeviceStopRequestOpenRaceError } from './stop-request.errors';
import { stopRequestDueAt, stopRequestVerdict } from './stop-request.policy';
import { StopRequestRepo, type StopRequestRecord } from './stop-request.repo';

/** How far ahead the days nobody works are read: far more than the working days a deadline can span. */
const CALENDAR_WINDOW_DAYS = 30;

/**
 * A holder asks to stop the collection of their machine (`US-09-04` AC-1, AC-10). Only the holder of a registration in force asks, with
 * no reason and no consent from anybody. A request that cannot be valid (collection stopped already, another one waiting) is still
 * kept, closed as invalid, to prove it was handled. Collection goes on until the IT Admin completes the request (AC-12).
 */
@Injectable()
export class StopRequestService {
  constructor(
    private readonly repo: StopRequestRepo,
    private readonly registry: RegistryRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly parameters: OperatingParametersApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws DeviceRegistrationNotFoundError (also for a registration of someone else) and DeviceRegistrationEndedError. */
  async create(
    actor: AuthenticatedPrincipal,
    registrationId: string,
    now: Date = new Date(),
  ): Promise<StopRequestRecord> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A request to stop collection was made before installation');
    const today = businessDateAt(now, organization.timeZone);
    const dueAt = stopRequestDueAt(
      now,
      await this.parameters.getNonWorkingDates(today, addDays(today, CALENDAR_WINDOW_DAYS)),
      organization.timeZone,
    );
    const attempt = () => this.attempt(actor, organization.id, registrationId, now, dueAt);
    try {
      return await attempt();
    } catch (error) {
      // The registration is locked, so this is only a defence: the other writer wins and this one runs again, once, to see it.
      if (!(error instanceof DeviceStopRequestOpenRaceError)) throw error;

      return attempt();
    }
  }

  private attempt(
    actor: AuthenticatedPrincipal,
    organizationId: string,
    registrationId: string,
    now: Date,
    dueAt: Date,
  ): Promise<StopRequestRecord> {
    return this.runner.run(async (tx) => {
      const registration = await this.registry.lockRegistrationChain(tx, registrationId);
      if (!registration || registration.holderEmployeeId !== actor.employeeId) {
        throw new DeviceRegistrationNotFoundError();
      }
      if (registration.endedAt !== null) throw new DeviceRegistrationEndedError();
      const verdict = stopRequestVerdict({
        registrationEnded: false,
        collectionStopped: registration.collectionStoppedAt !== null,
        openRequestExists: await this.repo.hasOpen(tx, registrationId),
      });
      const created = await this.repo.insert(tx, {
        organizationId,
        registrationId,
        requesterEmployeeId: actor.employeeId,
        requestedAt: now,
        dueAt,
        invalidReason: verdict,
      });
      await this.audit.record(
        tx,
        devicesEvent(
          byUser(actor),
          organizationId,
          'DEVICE_STOP_REQUEST.CREATED',
          'DeviceStopRequest',
          created.id,
          null,
          {
            registrationId,
            deviceId: created.deviceId,
            state: created.state,
            invalidReason: created.invalidReason,
            dueAt: dueAt.toISOString(),
          },
        ),
      );

      return created;
    });
  }
}
