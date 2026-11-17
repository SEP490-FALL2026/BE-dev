import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { byUser, devicesEvent } from '../devices-audit-event.mapper';
import { RegistryRepo } from '../registry/registry.repo';
import { DeviceStopRequestNotFoundError, DeviceStopRequestNotOpenError } from './stop-request.errors';
import { StopRequestRepo, type StopRequestRecord } from './stop-request.repo';

type Completion =
  { kind: 'COMPLETED'; request: StopRequestRecord } | { kind: 'NOT_OPEN'; state: 'COMPLETED' | 'INVALID' };

/**
 * An IT Admin stops the collection a holder asked to stop (`US-09-04` AC-3, AC-7). Any IT Admin may, the holder among them (the request
 * then says so). The credentials stay: only the registration stops being collected from, until the holder acknowledges again (AC-12).
 */
@Injectable()
export class StopRequestCompletionService {
  constructor(
    private readonly repo: StopRequestRepo,
    private readonly registry: RegistryRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws DeviceStopRequestNotFoundError and DeviceStopRequestNotOpenError (also when the registration ended and the request was closed). */
  async complete(actor: AuthenticatedPrincipal, id: string, now: Date = new Date()): Promise<StopRequestRecord> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A request to stop collection was completed before installation');

    const outcome = await this.runner.run<Completion>(async (tx) => {
      const head = await this.repo.find(id, tx);
      if (!head) throw new DeviceStopRequestNotFoundError();
      const registration = await this.registry.lockRegistrationChain(tx, head.registrationId);
      if (!registration) throw new DeviceStopRequestNotFoundError();
      // Read again under the lock: whoever wrote this request first took the same lock.
      const request = await this.repo.find(id, tx);
      if (!request) throw new DeviceStopRequestNotFoundError();
      if (request.state !== 'OPEN')
        return { kind: 'NOT_OPEN', state: request.state === 'COMPLETED' ? 'COMPLETED' : 'INVALID' };
      if (registration.endedAt !== null) {
        // The closing is kept although the answer is a refusal, so it is returned and not thrown from inside the transaction.
        await this.repo.closeAsRegistrationEnded(tx, id, now);

        return { kind: 'NOT_OPEN', state: 'INVALID' };
      }
      const selfHandled = registration.holderEmployeeId === actor.employeeId;
      const completed = await this.repo.complete(tx, id, {
        handledByAppUserId: actor.appUserId,
        handledAt: now,
        selfHandled,
      });
      await this.registry.setCollectionStopped(tx, registration.id, now);
      await this.audit.record(
        tx,
        devicesEvent(
          byUser(actor),
          organization.id,
          'DEVICE_STOP_REQUEST.COMPLETED',
          'DeviceStopRequest',
          id,
          { state: 'OPEN' },
          { registrationId: registration.id, deviceId: registration.deviceId, state: 'COMPLETED', selfHandled },
        ),
      );

      return { kind: 'COMPLETED', request: completed };
    });
    if (outcome.kind === 'NOT_OPEN') throw new DeviceStopRequestNotOpenError(outcome.state);

    return outcome.request;
  }
}
