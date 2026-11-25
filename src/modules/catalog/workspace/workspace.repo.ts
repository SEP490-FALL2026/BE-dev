import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { fromDateColumn, toDateColumn } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { WorkspaceNameTakenError } from './workspace.errors';
import type { WorkspaceAdminRecord, WorkspaceChanges, WorkspaceListFilter, WorkspaceRecord } from './workspace.types';

const WITH_PARTS = { vendor: { select: { name: true } }, admins: true } as const;
type WorkspaceRow = Prisma.WorkspaceGetPayload<{ include: typeof WITH_PARTS }>;

const ORDER: Prisma.WorkspaceOrderByWithRelationInput[] = [
  { vendor: { normalizedName: 'asc' } },
  { normalizedName: 'asc' },
  { id: 'asc' },
];

const toRecord = (row: WorkspaceRow): WorkspaceRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  vendorId: row.vendorId,
  vendorName: row.vendor.name,
  name: row.name,
  ownerAccountEmail: row.ownerAccountEmail,
  primaryOwnerEmployeeId: row.primaryOwnerEmployeeId,
  responsibleItAdminEmployeeId: row.responsibleItAdminEmployeeId,
  ownerLimit: row.ownerLimit,
  adminLimit: row.adminLimit,
  ownerTransferProcedure: row.ownerTransferProcedure,
  emergencyAccount:
    row.emergencyIdentity === null || row.emergencyHolderEmployeeId === null || row.emergencyLastReviewedOn === null
      ? null
      : {
          identity: row.emergencyIdentity,
          occupiesSeat: row.emergencyOccupiesSeat ?? false,
          holderEmployeeId: row.emergencyHolderEmployeeId,
          lastReviewedOn: fromDateColumn(row.emergencyLastReviewedOn),
        },
  adminNote: row.adminNote,
  admins: [...row.admins]
    .sort((a, b) => a.employeeId.localeCompare(b.employeeId))
    .map((admin) => ({ employeeId: admin.employeeId, role: admin.role })),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** The columns of the emergency account to write: none when the change leaves it, all null when it clears it. */
const emergencyColumns = (account: WorkspaceChanges['emergencyAccount']) =>
  account === undefined
    ? {}
    : {
        emergencyIdentity: account?.identity ?? null,
        emergencyOccupiesSeat: account?.occupiesSeat ?? null,
        emergencyHolderEmployeeId: account?.holderEmployeeId ?? null,
        emergencyLastReviewedOn: account ? toDateColumn(account.lastReviewedOn) : null,
      };

/** The one writer of `workspaces` and `workspace_admins`: the workspaces the company holds at its vendors (W3-10). */
@Injectable()
export class WorkspaceRepo {
  constructor(private readonly prisma: PrismaService) {}

  async find(id: string, tx?: DbTx): Promise<WorkspaceRecord | null> {
    const row = await (tx ?? this.prisma).workspace.findUnique({ where: { id }, include: WITH_PARTS });

    return row ? toRecord(row) : null;
  }

  /** The workspaces with these ids in one read, in id order; an id that does not exist is absent. */
  async findMany(ids: readonly string[], tx?: DbTx): Promise<WorkspaceRecord[]> {
    if (ids.length === 0) return [];
    const rows = await (tx ?? this.prisma).workspace.findMany({
      where: { id: { in: [...ids] } },
      include: WITH_PARTS,
      orderBy: { id: 'asc' },
    });

    return rows.map(toRecord);
  }

  /** The workspace locked `FOR UPDATE` until the transaction ends (tier 5b of `docs/rules/database-business.md`); null if absent. */
  async lock(tx: DbTx, id: string): Promise<WorkspaceRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM workspaces WHERE id = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;

    return this.find(id, tx);
  }

  /** The workspaces that hold a subscription in use (an active one): the ones a reader of the flags counts. */
  async findInUse(tx?: DbTx): Promise<WorkspaceRecord[]> {
    const rows = await (tx ?? this.prisma).workspace.findMany({
      where: { subscriptions: { some: { status: 'ACTIVE' } } },
      include: WITH_PARTS,
      orderBy: { id: 'asc' },
    });

    return rows.map(toRecord);
  }

  /** The workspaces of a vendor, oldest first (the default of a subscription is the only one, or the first). */
  async findOfVendor(vendorId: string, tx?: DbTx): Promise<WorkspaceRecord[]> {
    const rows = await (tx ?? this.prisma).workspace.findMany({
      where: { vendorId },
      include: WITH_PARTS,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toRecord);
  }

  /** The name of the vendor, or null when it does not exist. */
  async findVendorName(tx: DbTx, vendorId: string): Promise<string | null> {
    const vendor = await tx.vendor.findUnique({ where: { id: vendorId }, select: { name: true } });

    return vendor?.name ?? null;
  }

  /**
   * A page of workspaces by vendor name, workspace name, id, with the total: one snapshot, so a workspace made meanwhile is in none or in both.
   * `all` takes every workspace instead of a page (a filter on the flags is judged on the accounts, not in the database).
   */
  async page(
    filter: Pick<WorkspaceListFilter, 'vendorId'>,
    window: { skip: number; take: number } | 'all',
  ): Promise<{ items: WorkspaceRecord[]; total: number }> {
    const where = filter.vendorId ? { vendorId: filter.vendorId } : {};

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.workspace.findMany({
          where,
          include: WITH_PARTS,
          orderBy: ORDER,
          ...(window === 'all' ? {} : { skip: window.skip, take: window.take }),
        });

        return { items: rows.map(toRecord), total: await tx.workspace.count({ where }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** Inserts a workspace; the one with the same name at the vendor stops it. Throws WorkspaceNameTakenError. */
  async insert(
    tx: DbTx,
    input: {
      organizationId: string;
      vendorId: string;
      name: string;
      normalizedName: string;
      ownerAccountEmail: string | null;
      adminNote: string | null;
      responsibleItAdminEmployeeId: string;
    },
  ): Promise<string> {
    try {
      const created = await tx.workspace.create({ data: input, select: { id: true } });

      return created.id;
    } catch (error) {
      if (isUniqueViolation(error, 'normalized_name')) throw new WorkspaceNameTakenError();
      throw error;
    }
  }

  /**
   * Inserts a workspace unless the vendor already holds one of that name, in which case it inserts nothing and returns null. A simultaneous
   * insert of the same workspace waits for the first to commit, then also finds the row (the transaction is not aborted, as it would be by a
   * unique violation).
   */
  async insertIfAbsent(
    tx: DbTx,
    input: {
      organizationId: string;
      vendorId: string;
      name: string;
      normalizedName: string;
      responsibleItAdminEmployeeId: string;
    },
  ): Promise<string | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO workspaces (id, organization_id, vendor_id, name, normalized_name, responsible_it_admin_employee_id, updated_at)
      VALUES (gen_random_uuid(), ${input.organizationId}::uuid, ${input.vendorId}::uuid, ${input.name}, ${input.normalizedName},
              ${input.responsibleItAdminEmployeeId}::uuid, now())
      ON CONFLICT DO NOTHING
      RETURNING id`;

    return rows.length === 0 ? null : rows[0].id;
  }

  /** Writes the fields the change names (and the normalized name with the name); the version moves on. Throws WorkspaceNameTakenError. */
  async update(tx: DbTx, id: string, changes: WorkspaceChanges & { normalizedName?: string }): Promise<void> {
    try {
      await tx.workspace.update({
        where: { id },
        data: {
          ...(changes.name === undefined ? {} : { name: changes.name, normalizedName: changes.normalizedName }),
          ...(changes.ownerAccountEmail === undefined ? {} : { ownerAccountEmail: changes.ownerAccountEmail }),
          ...(changes.ownerLimit === undefined ? {} : { ownerLimit: changes.ownerLimit }),
          ...(changes.adminLimit === undefined ? {} : { adminLimit: changes.adminLimit }),
          ...(changes.ownerTransferProcedure === undefined
            ? {}
            : { ownerTransferProcedure: changes.ownerTransferProcedure }),
          ...emergencyColumns(changes.emergencyAccount),
          ...(changes.adminNote === undefined ? {} : { adminNote: changes.adminNote }),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error, 'normalized_name')) throw new WorkspaceNameTakenError();
      throw error;
    }
  }

  /** Replaces the administrators as a whole and names the primary owner; the version moves on. */
  async replaceAdmins(
    tx: DbTx,
    id: string,
    admins: readonly WorkspaceAdminRecord[],
    primaryOwnerEmployeeId: string,
  ): Promise<void> {
    await tx.workspaceAdmin.deleteMany({ where: { workspaceId: id } });
    await tx.workspaceAdmin.createMany({
      data: admins.map((admin) => ({ workspaceId: id, employeeId: admin.employeeId, role: admin.role })),
    });
    await tx.workspace.update({ where: { id }, data: { primaryOwnerEmployeeId } });
  }

  /**
   * Hands every workspace this person answers for to another (the hand-over of an IT Admin who leaves, `SBF-16`, `QĐ-116o`): the rows locked `FOR UPDATE`
   * in id order (tier 5b), then written; answers their ids.
   */
  async reassignResponsible(tx: DbTx, fromEmployeeId: string, toEmployeeId: string): Promise<string[]> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM workspaces WHERE responsible_it_admin_employee_id = ${fromEmployeeId}::uuid ORDER BY id FOR UPDATE`;
    const ids = locked.map((row) => row.id);
    if (ids.length === 0) return [];
    await tx.workspace.updateMany({ where: { id: { in: ids } }, data: { responsibleItAdminEmployeeId: toEmployeeId } });

    return ids;
  }

  /** Names who answers for the workspace; the version moves on. */
  async setResponsible(tx: DbTx, id: string, employeeId: string): Promise<void> {
    await tx.workspace.update({ where: { id }, data: { responsibleItAdminEmployeeId: employeeId } });
  }

  /**
   * How many subscriptions each of these workspaces holds. No subscription belongs to a workspace until the column that says so exists (the
   * package that adds it fills this in), so every workspace holds none.
   */
  subscriptionCountsOf(ids: readonly string[]): Promise<Map<string, number>> {
    return Promise.resolve(new Map(ids.map((id) => [id, 0])));
  }
}
