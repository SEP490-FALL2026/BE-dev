import { Inject, Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { OBJECT_STORAGE, type ObjectStoragePort } from '../../../infrastructure/object-storage/object-storage.port';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import type { ProvisioningEvidenceFile, ProvisioningEvidencePurpose } from '../public/catalog.types';
import { DocumentNotFoundError, DocumentPurposeMismatchError } from './contract.errors';
import { assertAttachable, LINK_TTL_SECONDS } from './contract.policy';
import { DocumentRepo } from './document.repo';

/** Evidence belongs to a task in its caller's transaction, after its task lock and before lower-tier locks. */
@Injectable()
export class ProvisioningEvidenceDocumentService {
  constructor(
    private readonly documents: DocumentRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  async attach(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: {
      documentIds: readonly string[];
      provisioningTaskId: string;
      purpose: ProvisioningEvidencePurpose;
    },
  ): Promise<void> {
    const organization = await this.requireOrganization(tx);
    const now = new Date();
    for (const id of input.documentIds.map((id) => id.toLowerCase()).sort()) {
      const document = await this.documents.lock(tx, id);
      if (!document || document.uploadedByAppUserId !== actor.appUserId) throw new DocumentNotFoundError();
      if (document.purpose !== input.purpose) throw new DocumentPurposeMismatchError();
      assertAttachable(document.status);
      await this.documents.markAttachedToProvisioningTask(tx, id, input.provisioningTaskId, now);
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          organization.id,
          'DOCUMENT.ATTACHED',
          'DocumentAttachment',
          id,
          { status: document.status },
          { status: 'READY', provisioningTaskId: input.provisioningTaskId },
        ),
      );
    }
  }

  list(taskId: string, tx?: DbTx): Promise<ProvisioningEvidenceFile[]> {
    return this.documents.listReadyOfProvisioningTask(taskId, tx);
  }

  async issueLink(
    actor: AuthenticatedPrincipal,
    input: { provisioningTaskId: string; documentId: string },
  ): Promise<{ url: string; expiresAt: Date } | null> {
    const document = await this.documents.findReadyOfProvisioningTask(input.provisioningTaskId, input.documentId);
    if (!document) return null;
    const organization = await this.requireOrganization();
    const expiresAt = new Date(Date.now() + LINK_TTL_SECONDS * 1000);
    const url = await this.storage.createDownloadUrl({
      key: document.finalObjectKey ?? document.objectKey,
      fileName: document.fileName,
      contentType: document.contentType,
      expiresInSeconds: LINK_TTL_SECONDS,
    });
    await this.runner.run((tx) =>
      this.audit.record(
        tx,
        catalogAuditEvent(actor, organization.id, 'DOCUMENT.LINK_ISSUED', 'DocumentAttachment', document.id, null, {
          expiresAt: expiresAt.toISOString(),
        }),
      ),
    );
    return { url, expiresAt };
  }

  private async requireOrganization(tx?: DbTx) {
    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) throw new Error('A document was kept before installation');
    return organization;
  }
}
