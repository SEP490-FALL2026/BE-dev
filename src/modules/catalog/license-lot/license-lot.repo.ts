import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { isCheckViolation, isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { LicenseLotMismatchError, LicenseLotRequestTakenError } from './license-lot.errors';
import type { LicenseLotChanges, LicenseLotPurpose, LicenseLotRecord, NewLicenseLot } from './license-lot.types';

type Row = Prisma.LicenseLotGetPayload<object>;

const toRecord = (row: Row): LicenseLotRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  planId: row.planId,
  workspaceId: row.workspaceId,
  purchasedOn: fromDateColumn(row.purchasedOn),
  licenseCount: row.licenseCount,
  unitPriceMinor: row.unitPriceMinor,
  originalUnitPriceMinor: row.originalUnitPriceMinor,
  originalCurrency: row.originalCurrency,
  invoiceActualMinor: row.invoiceActualMinor,
  purpose: row.purpose as LicenseLotPurpose,
  requestId: row.requestId,
  contractId: row.contractId,
  responsibleItAdminEmployeeId: row.responsibleItAdminEmployeeId,
  legacySubscriptionId: row.legacySubscriptionId,
  note: row.note,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** What the database says of a lot it refuses (the guard of the plan, the workspace, the purpose, the contract; the lot of a request). */
function asLotError(error: unknown): unknown {
  if (isUniqueViolation(error, 'license_lots_request_key', 'request_id')) return new LicenseLotRequestTakenError();
  if (isCheckViolation(error, 'license_lots_plan_k4')) return new LicenseLotMismatchError('PLAN');
  if (isCheckViolation(error, 'license_lots_workspace_required'))
    return new LicenseLotMismatchError('WORKSPACE_REQUIRED');
  if (isCheckViolation(error, 'license_lots_workspace_vendor')) return new LicenseLotMismatchError('WORKSPACE_VENDOR');
  if (isCheckViolation(error, 'license_lots_purpose_binding')) return new LicenseLotMismatchError('PURPOSE_BINDING');
  if (isCheckViolation(error, 'license_lots_contract_vendor')) return new LicenseLotMismatchError('CONTRACT_VENDOR');

  return error;
}

/**
 * The one writer of `license_lots`: a purchase of licenses of a K4 plan. The lot is locked `FOR UPDATE` at tier 6a, after the period it came from
 * (6) when it came from one, before the line and the keys; the licenses taken of it are counted by the database against `license_count`.
 */
@Injectable()
export class LicenseLotRepo {
  constructor(private readonly prisma: PrismaService) {}

  async find(id: string, tx?: DbTx): Promise<LicenseLotRecord | null> {
    const row = await (tx ?? this.prisma).licenseLot.findUnique({ where: { id } });

    return row ? toRecord(row) : null;
  }

  /** The lot with this id, locked for writing (tier 6a); null when it does not exist. */
  async lock(tx: DbTx, id: string): Promise<LicenseLotRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM license_lots WHERE id = ${id}::uuid FOR UPDATE`;

    return locked.length === 0 ? null : this.find(id, tx);
  }

  /** The lots with these ids in one read; an id that does not exist is absent. */
  async findMany(ids: readonly string[], tx?: DbTx): Promise<Map<string, LicenseLotRecord>> {
    if (ids.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).licenseLot.findMany({ where: { id: { in: [...ids] } } });

    return new Map(rows.map((row) => [row.id, toRecord(row)]));
  }

  /** The lot bought for a request, if there is one (at most one). */
  async findOfRequest(requestId: string, tx?: DbTx): Promise<LicenseLotRecord | null> {
    const row = await (tx ?? this.prisma).licenseLot.findFirst({ where: { requestId, purpose: 'REQUEST' } });

    return row ? toRecord(row) : null;
  }

  /** The lots of a plan, oldest purchase first. */
  async ofPlan(planId: string, tx?: DbTx): Promise<LicenseLotRecord[]> {
    const rows = await (tx ?? this.prisma).licenseLot.findMany({
      where: { planId },
      orderBy: [{ purchasedOn: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toRecord);
  }

  /** Writes a lot. Throws LicenseLotMismatchError or LicenseLotRequestTakenError. */
  async insert(tx: DbTx, input: NewLicenseLot): Promise<LicenseLotRecord> {
    try {
      const row = await tx.licenseLot.create({
        data: {
          organizationId: input.organizationId,
          planId: input.planId,
          workspaceId: input.workspaceId,
          purchasedOn: toDateColumn(input.purchasedOn),
          licenseCount: input.licenseCount,
          unitPriceMinor: input.unitPriceMinor,
          originalUnitPriceMinor: input.originalUnitPriceMinor ?? null,
          originalCurrency: input.originalCurrency ?? null,
          purpose: input.purpose,
          requestId: input.requestId ?? null,
          contractId: input.contractId ?? null,
          responsibleItAdminEmployeeId: input.responsibleItAdminEmployeeId,
          note: input.note ?? null,
        },
      });

      return toRecord(row);
    } catch (error) {
      throw asLotError(error);
    }
  }

  /** Changes what an IT Admin may change of a lot and moves its version on. Throws LicenseLotMismatchError. */
  async update(tx: DbTx, id: string, changes: LicenseLotChanges): Promise<LicenseLotRecord> {
    try {
      const row = await tx.licenseLot.update({
        where: { id },
        data: {
          ...(changes.workspaceId === undefined ? {} : { workspaceId: changes.workspaceId }),
          ...(changes.purchasedOn === undefined ? {} : { purchasedOn: toDateColumn(changes.purchasedOn) }),
          ...(changes.licenseCount === undefined ? {} : { licenseCount: changes.licenseCount }),
          ...(changes.unitPriceMinor === undefined ? {} : { unitPriceMinor: changes.unitPriceMinor }),
          ...(changes.originalUnitPriceMinor === undefined
            ? {}
            : { originalUnitPriceMinor: changes.originalUnitPriceMinor }),
          ...(changes.originalCurrency === undefined ? {} : { originalCurrency: changes.originalCurrency }),
          ...(changes.contractId === undefined ? {} : { contractId: changes.contractId }),
          ...(changes.note === undefined ? {} : { note: changes.note }),
          updatedAt: new Date(),
        },
      });

      return toRecord(row);
    } catch (error) {
      throw asLotError(error);
    }
  }

  /** Names who answers for the lot (the creator at first; only a Super Admin changes it, and the handover of an IT Admin moves it). */
  async setResponsible(tx: DbTx, id: string, employeeId: string | null): Promise<LicenseLotRecord> {
    const row = await tx.licenseLot.update({
      where: { id },
      data: { responsibleItAdminEmployeeId: employeeId, updatedAt: new Date() },
    });

    return toRecord(row);
  }

  /** Records what Finance confirmed the invoice of the lot at. */
  async setInvoiceActual(tx: DbTx, id: string, actualMinor: bigint): Promise<void> {
    await tx.licenseLot.update({ where: { id }, data: { invoiceActualMinor: actualMinor, updatedAt: new Date() } });
  }
}
