import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { DeviceInitialRecordProgress } from '../public/devices.types';
import { RegistryQueryRepo } from '../registry/registry-query.repo';

/** Reads onboarding progress for initial device records and missing BM-06 signatures. */
@Injectable()
export class InitialRecordQueryService {
  constructor(
    private readonly queries: RegistryQueryRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  async progress(tx?: DbTx): Promise<DeviceInitialRecordProgress> {
    const read = async (db: DbTx): Promise<DeviceInitialRecordProgress> => {
      const organization = await this.organizationReads.getOrganization(db);
      if (!organization) return { initialRecords: 0, signaturesMissing: 0 };

      const counts = await this.audit.countByAction(db, ['DEVICE.INITIAL_RECORDED']);
      const signaturesMissing = await this.queries.countOpenRegistrationsMissingSignature(organization.id, db);

      return {
        initialRecords: counts.get('DEVICE.INITIAL_RECORDED') ?? 0,
        signaturesMissing,
      };
    };

    return tx ? read(tx) : this.runner.run(read);
  }
}
