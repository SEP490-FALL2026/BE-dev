import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { byUser, devicesEvent } from '../devices-audit-event.mapper';
import { NoticeRepo } from '../notice/notice.repo';
import { DeviceRegistrationEndedError, DeviceRegistrationNotFoundError } from '../registry/registry.errors';
import { RegistryRepo } from '../registry/registry.repo';
import {
  DeviceAcknowledgementNoticeNotCurrentError,
  DeviceAlreadyAcknowledgedError,
  DeviceSignatureRecordMissingError,
} from './acknowledgement.errors';
import { acknowledgementBlock } from './acknowledgement.policy';
import { AcknowledgementRepo } from './acknowledgement.repo';

export interface AcknowledgementResult {
  id: string;
  registrationId: string;
  noticeVersionNumber: number;
  acknowledgedAt: Date;
}

/**
 * The holder acknowledges, on their own, that they have read the notice of the machine they use (`US-09-03`): only the holder, only
 * under the version in force, only once the IT Admin has kept the signed `BM-06`. Collection of that machine starts here.
 */
@Injectable()
export class AcknowledgementService {
  constructor(
    private readonly repo: AcknowledgementRepo,
    private readonly registry: RegistryRepo,
    private readonly notices: NoticeRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Throws DeviceRegistrationNotFoundError (also for a registration of someone else), DeviceRegistrationEndedError,
   * DeviceSignatureRecordMissingError, DeviceAcknowledgementNoticeNotCurrentError and DeviceAlreadyAcknowledgedError.
   */
  async acknowledge(
    actor: AuthenticatedPrincipal,
    registrationId: string,
    input: { noticeVersionId: string },
    now: Date = new Date(),
  ): Promise<AcknowledgementResult> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A notice was acknowledged before installation');

    return this.runner.run(async (tx) => {
      const registration = await this.registry.lockRegistrationChain(tx, registrationId);
      if (!registration || registration.holderEmployeeId !== actor.employeeId) {
        throw new DeviceRegistrationNotFoundError();
      }
      const current = await this.notices.current(organization.id, tx);
      const block = acknowledgementBlock({
        registrationEnded: registration.endedAt !== null,
        signatureRecorded: await this.registry.hasSignatureRecord(registrationId, tx),
        currentNoticeId: current?.id ?? null,
        offeredNoticeId: input.noticeVersionId,
        alreadyActive: registration.acknowledgedFrom !== null && registration.collectionStoppedAt === null,
      });
      if (block || !current) throw this.refusal(block);
      const row = await this.repo.insert(tx, {
        organizationId: organization.id,
        registrationId,
        noticeVersionId: current.id,
        employeeId: actor.employeeId,
        appUserId: actor.appUserId,
        acknowledgedAt: now,
      });
      await this.registry.setAcknowledged(tx, registrationId, now);
      await this.audit.record(
        tx,
        devicesEvent(
          byUser(actor),
          organization.id,
          'DEVICE_ACKNOWLEDGEMENT.RECORDED',
          'DeviceRegistration',
          registrationId,
          null,
          {
            acknowledgementId: row.id,
            noticeVersionNumber: current.versionNumber,
          },
        ),
      );

      return { ...row, noticeVersionNumber: current.versionNumber };
    });
  }

  private refusal(block: ReturnType<typeof acknowledgementBlock>): Error {
    switch (block) {
      case 'REGISTRATION_ENDED':
        return new DeviceRegistrationEndedError();
      case 'SIGNATURE_RECORD_MISSING':
        return new DeviceSignatureRecordMissingError();
      case 'ALREADY_ACKNOWLEDGED':
        return new DeviceAlreadyAcknowledgedError();
      default:
        return new DeviceAcknowledgementNoticeNotCurrentError();
    }
  }
}
