import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import { SeatOccupancyHook } from '../public/catalog.extension-points';
import { LicenseLotNotFoundError, LicenseLotNotResponsibleError, LicenseLotStaleError } from './license-lot.errors';
import { assertPriceOpen, judgeContractChange } from './license-lot.policy';
import { LicenseLotRepo } from './license-lot.repo';
import { LicenseLotPriceService } from './license-lot-price.service';
import type { LicenseLotChanges, LicenseLotDetail, LicenseLotRecord, UpdateLicenseLotInput } from './license-lot.types';
import { LicenseLotViewService } from './license-lot-view.service';

/**
 * The lots of licenses of a K4 plan once made (W3-24; `LicenseLotCreateService` makes them): changed (contract, note, price) only by the IT Admin who answers for the lot, read in pages.
 *
 * Lock order: a change locks the lot `FOR UPDATE` (6a) and nothing else. One audit event for each write.
 */
@Injectable()
export class LicenseLotService {
  constructor(
    private readonly lots: LicenseLotRepo,
    private readonly views: LicenseLotViewService,
    private readonly pricing: LicenseLotPriceService,
    private readonly occupancy: SeatOccupancyHook,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Changes the contract, the note or the price of a lot, only by the IT Admin who answers for it and on the version they read. A contract left for another
   * (or for none) names its reason; the price is set until a key of the lot is given or an invoice of it is confirmed. Throws LicenseLotNotFoundError,
   * LicenseLotNotResponsibleError, LicenseLotStaleError, LicenseLotContractReasonRequiredError, LicenseLotPriceLockedError and LicenseLotMismatchError (the contract of
   * another vendor).
   */
  async update(
    actor: AuthenticatedPrincipal,
    id: string,
    input: UpdateLicenseLotInput & { expectedUpdatedAt: Date },
  ): Promise<LicenseLotDetail> {
    const unitPrice = input.unitPrice ? await this.pricing.readUnitPrice(input.unitPrice, 'unitPrice') : undefined;
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A lot was changed before installation');

    const record = await this.runner.run(async (tx) => {
      const current = await this.lots.lock(tx, id);
      if (!current) throw new LicenseLotNotFoundError();
      if (current.responsibleItAdminEmployeeId !== actor.employeeId) throw new LicenseLotNotResponsibleError();
      if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
        throw new LicenseLotStaleError(current.updatedAt);
      const contract = judgeContractChange({
        current: current.contractId,
        next: input.contractId,
        reason: input.contractChangeReason,
      });
      const priceChanges = unitPrice !== undefined && unitPrice.amountMinor !== current.unitPriceMinor;
      if (priceChanges) await this.requirePriceOpen(tx, current);
      const changes: LicenseLotChanges = {
        ...(contract === 'CHANGED' ? { contractId: input.contractId } : {}),
        ...(input.note === undefined ? {} : { note: input.note }),
        ...(priceChanges ? { unitPriceMinor: unitPrice.amountMinor } : {}),
      };
      if (Object.keys(changes).length === 0) return current;
      const changed = await this.lots.update(tx, id, changes);
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          organization.id,
          'LICENSE_LOT.UPDATED',
          'LicenseLot',
          id,
          {
            contractId: current.contractId,
            note: current.note,
            unitPriceMinor: current.unitPriceMinor.toString(),
          },
          {
            contractId: changed.contractId,
            note: changed.note,
            unitPriceMinor: changed.unitPriceMinor.toString(),
            ...(contract === 'CHANGED' && input.contractChangeReason
              ? { contractChangeReason: input.contractChangeReason.trim() }
              : {}),
          },
        ),
      );

      return changed;
    });

    return (await this.views.viewAll([record]))[0];
  }

  /** One lot with what it gave out. Throws LicenseLotNotFoundError. */
  async get(id: string): Promise<LicenseLotDetail> {
    const record = await this.lots.find(id);
    if (!record) throw new LicenseLotNotFoundError();

    return (await this.views.viewAll([record]))[0];
  }

  /** A page of lots, the newest purchase first, optionally of one plan. */
  async list(query: { planId?: string; page: number; pageSize: number }): Promise<Page<LicenseLotDetail>> {
    const { rows, total } = await this.lots.page({
      ...(query.planId ? { planId: query.planId } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(await this.views.viewAll(rows), total, query.page, query.pageSize);
  }

  private async requirePriceOpen(tx: DbTx, lot: LicenseLotRecord): Promise<void> {
    const keys = await this.occupancy.get().keyCountsOfLots([lot.id], tx);
    assertPriceOpen({ invoiceActualMinor: lot.invoiceActualMinor, keysAssigned: keys.get(lot.id)?.assigned ?? 0 });
  }
}
