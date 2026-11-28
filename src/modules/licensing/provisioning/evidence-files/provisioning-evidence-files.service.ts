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
  constructor(private readonly catalog: CatalogApi) {}

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
}
