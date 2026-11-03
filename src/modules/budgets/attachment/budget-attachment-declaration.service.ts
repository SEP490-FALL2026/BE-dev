import { Inject, Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { ObjectKeyFactory } from '../../../infrastructure/object-storage/object-key.factory';
import { OBJECT_STORAGE, type ObjectStoragePort } from '../../../infrastructure/object-storage/object-storage.port';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { budgetAuditEvent, BudgetFactsService } from '../budget/budget-facts.service';
import { VersionAccessService } from '../version/version-access.service';
import type { CreateBudgetAttachmentDto } from './budget-attachment.dto';
import { BudgetAttachmentLimitReachedError } from './budget-attachment.errors';
import { toBudgetAttachmentWire } from './budget-attachment.mapper';
import {
  assertFileAllowed,
  MAX_RECORD_ATTACHMENTS,
  MAX_USER_UNATTACHED_ATTACHMENTS,
  UPLOAD_LINK_SECONDS,
} from './budget-attachment.policy';
import { BudgetAttachmentRepo } from './budget-attachment.repo';
import type { BudgetAttachmentRecord } from './budget-attachment.types';

export interface DeclareAttachmentResult {
  attachment: ReturnType<typeof toBudgetAttachmentWire>;
  upload: {
    url: string;
    method: 'PUT';
    headers: {
      'Content-Type': string;
      'Content-Length': string;
    };
    expiresAt: string;
  };
}

@Injectable()
export class BudgetAttachmentDeclarationService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly attachments: BudgetAttachmentRepo,
    private readonly facts: BudgetFactsService,
    private readonly access: VersionAccessService,
    private readonly parameters: OperatingParametersApi,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    private readonly audit: AuditApi,
  ) {}

  async declareVersion(
    actor: AuthenticatedPrincipal,
    versionId: string,
    input: CreateBudgetAttachmentDto,
  ): Promise<DeclareAttachmentResult> {
    const fiscalStart = await this.access.begin(actor);
    const maxBytes = Number(await this.parameters.getValue('DOCUMENT_MAX_SIZE_MB')) * 1024 * 1024;
    assertFileAllowed({ ...input, maxBytes });

    const objectKey = new ObjectKeyFactory().create('pending-documents');

    const created = await this.runner.run(async (tx) => {
      const version = await this.access.lockEditable(tx, versionId, fiscalStart);
      await this.attachments.lockUploader(tx, actor.employeeId);
      const userUnattached = await this.attachments.countUnattachedByEmployee(tx, actor.employeeId);
      if (userUnattached >= MAX_USER_UNATTACHED_ATTACHMENTS) {
        throw new BudgetAttachmentLimitReachedError(MAX_USER_UNATTACHED_ATTACHMENTS);
      }
      const versionAttached = await this.attachments.countAttachedByVersion(tx, versionId);
      if (versionAttached >= MAX_RECORD_ATTACHMENTS) {
        throw new BudgetAttachmentLimitReachedError(MAX_RECORD_ATTACHMENTS);
      }

      const inserted = await this.attachments.insert(tx, {
        organizationId: version.organizationId,
        target: 'VERSION',
        fileName: input.fileName.trim(),
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        objectKey,
        uploadedByEmployeeId: actor.employeeId,
        versionId,
      });

      await this.audit.record(
        tx,
        budgetAuditEvent(
          actor,
          version.organizationId,
          'BUDGET_ATTACHMENT.DECLARED',
          'BUDGET_ATTACHMENT',
          inserted.id,
          {
            target: 'VERSION',
            versionId,
            fileName: inserted.fileName,
            contentType: inserted.contentType,
            sizeBytes: inserted.sizeBytes,
          },
        ),
      );

      return inserted;
    });

    return this.buildResult(actor, created, input);
  }

  async declareProposal(
    actor: AuthenticatedPrincipal,
    input: CreateBudgetAttachmentDto,
  ): Promise<DeclareAttachmentResult> {
    const today = await this.facts.today(new Date());
    await this.facts.requireHeadedCostCenter(actor.employeeId, today);
    const organizationId = await this.facts.organizationId();

    const maxBytes = Number(await this.parameters.getValue('DOCUMENT_MAX_SIZE_MB')) * 1024 * 1024;
    assertFileAllowed({ ...input, maxBytes });

    const objectKey = new ObjectKeyFactory().create('pending-documents');

    const created = await this.runner.run(async (tx) => {
      await this.attachments.lockUploader(tx, actor.employeeId);
      const userUnattached = await this.attachments.countUnattachedByEmployee(tx, actor.employeeId);
      if (userUnattached >= MAX_USER_UNATTACHED_ATTACHMENTS) {
        throw new BudgetAttachmentLimitReachedError(MAX_USER_UNATTACHED_ATTACHMENTS);
      }

      const inserted = await this.attachments.insert(tx, {
        organizationId,
        target: 'PROPOSAL',
        fileName: input.fileName.trim(),
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        objectKey,
        uploadedByEmployeeId: actor.employeeId,
      });

      await this.audit.record(
        tx,
        budgetAuditEvent(actor, organizationId, 'BUDGET_ATTACHMENT.DECLARED', 'BUDGET_ATTACHMENT', inserted.id, {
          target: 'PROPOSAL',
          fileName: inserted.fileName,
          contentType: inserted.contentType,
          sizeBytes: inserted.sizeBytes,
        }),
      );

      return inserted;
    });

    return this.buildResult(actor, created, input);
  }

  private async buildResult(
    actor: AuthenticatedPrincipal,
    record: BudgetAttachmentRecord,
    input: CreateBudgetAttachmentDto,
  ): Promise<DeclareAttachmentResult> {
    const url = await this.storage.createUploadUrl({
      key: record.objectKey,
      contentType: input.contentType,
      contentLength: input.sizeBytes,
      expiresInSeconds: UPLOAD_LINK_SECONDS,
    });

    const people = await this.facts.people([actor.employeeId]);
    const uploader = people.get(actor.employeeId) ?? null;

    return {
      attachment: toBudgetAttachmentWire(record, uploader),
      upload: {
        url,
        method: 'PUT',
        headers: {
          'Content-Type': input.contentType,
          'Content-Length': String(input.sizeBytes),
        },
        expiresAt: new Date(Date.now() + UPLOAD_LINK_SECONDS * 1000).toISOString(),
      },
    };
  }
}
