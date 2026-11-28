import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { EmployeeNotStartedError } from '../../../organization/public/organization.errors';
import { ProvisioningTaskNotFoundError } from '../../public/licensing.errors';
import { ProvisioningTaskRepo } from '../provisioning-task.repo';
import { ProvisioningTaskFrame } from '../provisioning-task-frame.service';
import { assertItAdmin } from '../provisioning.policy';
import { ProvisioningNotInChargeError, ProvisioningEvidenceFileNotFoundError } from '../provisioning.errors';
import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../../catalog/public/catalog.api';
import { DocumentAttachRefusedError } from '../../../catalog/public/catalog.errors';
import type { ProvisioningEvidencePurpose } from '../../../catalog/public/catalog.types';
import { ProvisioningEvidenceFileInvalidError } from '../provisioning.errors';
import { assertEvidenceFileList } from './provisioning-evidence-files.policy';

@Injectable()
export class ProvisioningEvidenceFilesService {
  constructor(
    private readonly catalog: CatalogApi,
    private readonly tasks: ProvisioningTaskRepo,
    private readonly frame: ProvisioningTaskFrame,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  async attach(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    taskId: string,
    ids: readonly string[] | undefined,
    purpose: ProvisioningEvidencePurpose,
  ): Promise<string[]> {
    const documentIds = assertEvidenceFileList(ids);
    if (documentIds.length === 0) return [];
    try {
      await this.catalog.attachProvisioningEvidence(tx, actor, { documentIds, provisioningTaskId: taskId, purpose });
    } catch (error) {
      if (error instanceof DocumentAttachRefusedError) throw new ProvisioningEvidenceFileInvalidError(error.problem);
      throw error;
    }
    return documentIds;
  }

  async list(actor: AuthenticatedPrincipal, taskId: string): Promise<EvidenceFileView[]> {
    await this.requireReadable(actor, taskId);
    const files = await this.catalog.listProvisioningEvidence(taskId);
    return files.map<EvidenceFileView>(({ purpose, ...file }) => ({
      ...file,
      stage: purpose === 'PROVISIONING_EVIDENCE' ? 'COMPLETION' : 'ACCESS_CUT',
    }));
  }

  async link(actor: AuthenticatedPrincipal, taskId: string, fileId: string): Promise<{ url: string; expiresAt: Date }> {
    await this.requireReadable(actor, taskId);
    const link = await this.catalog.issueProvisioningEvidenceLink(actor, {
      provisioningTaskId: taskId,
      documentId: fileId,
    });
    if (!link) throw new ProvisioningEvidenceFileNotFoundError();
    return link;
  }

  private async requireReadable(actor: AuthenticatedPrincipal, taskId: string): Promise<void> {
    const superAdmin = actor.roles.includes('SUPER_ADMIN');
    if (!superAdmin) assertItAdmin(actor);
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new ProvisioningTaskNotFoundError();
    const task = await this.tasks.findInOrganization(taskId, organization.id);
    if (!task) throw new ProvisioningTaskNotFoundError();
    if (superAdmin) return;
    try {
      await this.frame.requireActingItAdmin(undefined, actor, {
        beneficiaryEmployeeId: task.assignment.employeeId,
        taskId,
      });
    } catch (error) {
      if (error instanceof ProvisioningNotInChargeError || error instanceof EmployeeNotStartedError)
        throw new ProvisioningTaskNotFoundError();
      throw error;
    }
  }
}

export interface EvidenceFileView {
  id: string;
  stage: 'COMPLETION' | 'ACCESS_CUT';
  fileName: string;
  contentType: string;
  sizeBytes: number;
  attachedAt: Date;
}
