import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import { WorkspaceViewService } from '../workspace/workspace-view.service';
import { LicenseLotNotFoundError, LicenseLotResponsibleNotItAdminError } from './license-lot.errors';
import { LicenseLotRepo } from './license-lot.repo';
import type { LicenseLotDetail } from './license-lot.types';
import { LicenseLotViewService } from './license-lot-view.service';

/**
 * The Super Admin names the IT Admin who answers for a lot (`QĐ-118f`, `QĐ-118l`): the only way it changes hands, apart from the hand-over of an IT Admin who
 * leaves (`SBF-16`). A subscription of a perpetual purchase a lot was born from is changed here too, in the lot of the same id, and nowhere else.
 *
 * Lock order: ONE lock, the lot `FOR UPDATE` (tier 6a). One audit event says who changed it, from whom to whom and why.
 */
@Injectable()
export class LicenseLotResponsibleService {
  constructor(
    private readonly lots: LicenseLotRepo,
    private readonly views: LicenseLotViewService,
    private readonly workspaces: WorkspaceViewService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws LicenseLotNotFoundError and LicenseLotResponsibleNotItAdminError. */
  async change(
    actor: AuthenticatedPrincipal,
    lotId: string,
    input: { employeeId: string; reason: string },
  ): Promise<{ lot: LicenseLotDetail; changed: boolean }> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A lot was changed before installation');

    const changed = await this.runner.run(async (tx) => {
      const current = await this.lots.lock(tx, lotId);
      if (!current) throw new LicenseLotNotFoundError();
      if (current.responsibleItAdminEmployeeId === input.employeeId) return false;
      if (!(await this.workspaces.isUsableItAdmin(input.employeeId, tx)))
        throw new LicenseLotResponsibleNotItAdminError();

      await this.lots.setResponsible(tx, lotId, input.employeeId);
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          organization.id,
          'LICENSE_LOT.RESPONSIBLE_CHANGED',
          'LicenseLot',
          lotId,
          { responsibleItAdminEmployeeId: current.responsibleItAdminEmployeeId },
          { responsibleItAdminEmployeeId: input.employeeId, reason: input.reason },
        ),
      );

      return true;
    });
    const record = await this.lots.find(lotId);
    if (!record) throw new LicenseLotNotFoundError();

    return { lot: (await this.views.viewAll([record]))[0], changed };
  }
}
