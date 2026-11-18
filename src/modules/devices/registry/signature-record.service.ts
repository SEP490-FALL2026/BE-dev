import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { NoticeRepo } from '../notice/notice.repo';
import { byUser, devicesEvent } from '../devices-audit-event.mapper';
import {
  DeviceRegistrationEndedError,
  DeviceRegistrationNotFoundError,
  DeviceSignatureNoticeVersionNotFoundError,
} from './registry.errors';
import { RegistryRepo, type SignatureRecordRow } from './registry.repo';

/**
 * The record of a signed `BM-06` (`US-09-03`): the IT Admin uploads the scan, then says which registration and which version of the
 * notice it was signed under. The file belongs to the holder who signed it, not to a contract.
 */
@Injectable()
export class SignatureRecordService {
  constructor(
    private readonly repo: RegistryRepo,
    private readonly notices: NoticeRepo,
    private readonly catalog: CatalogApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Throws DeviceRegistrationNotFoundError, DeviceRegistrationEndedError, DeviceSignatureNoticeVersionNotFoundError and the
   * errors of the catalog for a file that is not the uploader's, of another kind, not uploaded or already attached.
   */
  async record(
    actor: AuthenticatedPrincipal,
    registrationId: string,
    input: { documentId: string; noticeVersionId: string },
  ): Promise<SignatureRecordRow> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A signed record was kept before installation');

    return this.runner.run(async (tx) => {
      const registration = await this.repo.lockRegistrationChain(tx, registrationId);
      if (!registration) throw new DeviceRegistrationNotFoundError();
      if (registration.endedAt) throw new DeviceRegistrationEndedError();
      const notice = await this.notices.find(organization.id, input.noticeVersionId, tx);
      if (!notice) throw new DeviceSignatureNoticeVersionNotFoundError();
      await this.catalog.attachSignatureRecord(tx, actor, {
        documentId: input.documentId,
        signerEmployeeId: registration.holderEmployeeId,
      });
      const record = await this.repo.insertSignatureRecord(
        tx,
        {
          organizationId: organization.id,
          registrationId,
          documentId: input.documentId,
          noticeVersionId: notice.id,
          signerEmployeeId: registration.holderEmployeeId,
          recordedByAppUserId: actor.appUserId,
        },
        notice.versionNumber,
      );
      await this.audit.record(
        tx,
        devicesEvent(
          byUser(actor),
          organization.id,
          'DEVICE_SIGNATURE_RECORD.RECORDED',
          'DeviceRegistration',
          registrationId,
          null,
          {
            recordId: record.id,
            documentId: input.documentId,
            noticeVersionNumber: notice.versionNumber,
          },
        ),
      );

      return record;
    });
  }
}
