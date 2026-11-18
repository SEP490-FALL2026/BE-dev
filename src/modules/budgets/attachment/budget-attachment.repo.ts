import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { PROPOSAL_UNATTACHED_AFTER_MS, UPLOAD_ABANDONED_AFTER_MS } from './budget-attachment.policy';
import type { BudgetAttachmentRecord, BudgetAttachmentTarget } from './budget-attachment.types';

@Injectable()
export class BudgetAttachmentRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(
    tx: DbTx,
    data: {
      organizationId: string;
      target: BudgetAttachmentTarget;
      fileName: string;
      contentType: string;
      sizeBytes: number;
      objectKey: string;
      uploadedByEmployeeId: string;
      versionId?: string | null;
    },
  ): Promise<BudgetAttachmentRecord> {
    const row = await tx.budgetAttachment.create({
      data: {
        organizationId: data.organizationId,
        target: data.target,
        status: 'AWAITING_UPLOAD',
        fileName: data.fileName,
        contentType: data.contentType,
        sizeBytes: data.sizeBytes,
        objectKey: data.objectKey,
        uploadedByEmployeeId: data.uploadedByEmployeeId,
        versionId: data.versionId ?? null,
      },
    });

    return toRecord(row);
  }

  async find(id: string, tx?: DbTx): Promise<BudgetAttachmentRecord | null> {
    const client = tx ?? this.prisma;
    const row = await client.budgetAttachment.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }

  /**
   * The row locked `FOR UPDATE` for the rest of the transaction, then read through the model (a raw `SELECT *` comes back
   * with the column names, not the field names); or null. Same pattern as `catalog/contract/document.repo.ts`.
   */
  async lock(tx: DbTx, id: string): Promise<BudgetAttachmentRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "budget_attachments" WHERE "id" = ${id}::uuid FOR UPDATE
    `;
    if (locked.length === 0) return null;

    return this.find(id, tx);
  }

  /** The rows of `ids` locked in ascending `id` order (one lock order for every writer), then read through the model. */
  async lockManyAsc(tx: DbTx, ids: string[]): Promise<BudgetAttachmentRecord[]> {
    if (ids.length === 0) return [];
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "budget_attachments"
      WHERE "id" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY "id" ASC
      FOR UPDATE
    `;
    if (locked.length === 0) return [];
    const rows = await tx.budgetAttachment.findMany({
      where: { id: { in: locked.map((row) => row.id) } },
      orderBy: { id: 'asc' },
    });

    return rows.map(toRecord);
  }

  /**
   * The next file the sweeper may give up (an upload that never came for 24 hours, a kept upload nobody sent for 7
   * days) that no other transaction holds, locked `FOR UPDATE SKIP LOCKED` for the rest of this transaction, or null.
   * `excluded` are the ones this pass already failed on, so a row that keeps failing is not picked again.
   */
  async lockNextExpired(tx: DbTx, now: Date, excluded: readonly string[]): Promise<BudgetAttachmentRecord | null> {
    const awaitingCutoff = new Date(now.getTime() - UPLOAD_ABANDONED_AFTER_MS);
    const uploadedCutoff = new Date(now.getTime() - PROPOSAL_UNATTACHED_AFTER_MS);
    const picked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "budget_attachments"
      WHERE (("status"::text = 'AWAITING_UPLOAD' AND "created_at" < ${awaitingCutoff})
          OR ("status"::text = 'UPLOADED' AND "created_at" < ${uploadedCutoff}))
        AND "id" <> ALL(${[...excluded]}::uuid[])
      ORDER BY "created_at" ASC, "id" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    if (picked.length === 0) return null;

    return this.find(picked[0].id, tx);
  }

  async lockUploader(tx: DbTx, employeeId: string): Promise<void> {
    const key = `budget-attachment-uploader:${employeeId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }

  async countUnattachedByEmployee(tx: DbTx, employeeId: string): Promise<number> {
    return tx.budgetAttachment.count({
      where: {
        uploadedByEmployeeId: employeeId,
        status: { in: ['AWAITING_UPLOAD', 'UPLOADED'] },
      },
    });
  }

  async countAttachedByVersion(tx: DbTx, versionId: string): Promise<number> {
    return tx.budgetAttachment.count({
      where: {
        versionId,
        status: 'ATTACHED',
      },
    });
  }

  async countAttachedByProposal(tx: DbTx, proposalId: string): Promise<number> {
    return tx.budgetAttachment.count({
      where: {
        proposalId,
        status: 'ATTACHED',
      },
    });
  }

  async markUploaded(tx: DbTx, id: string, finalObjectKey: string): Promise<void> {
    await tx.budgetAttachment.update({
      where: { id },
      data: {
        status: 'UPLOADED',
        finalObjectKey,
      },
    });
  }

  async markAttachedVersion(tx: DbTx, id: string, finalObjectKey: string, attachedAt: Date): Promise<void> {
    await tx.budgetAttachment.update({
      where: { id },
      data: {
        status: 'ATTACHED',
        finalObjectKey,
        attachedAt,
      },
    });
  }

  async markAttachedProposal(tx: DbTx, id: string, proposalId: string, attachedAt: Date): Promise<void> {
    await tx.budgetAttachment.update({
      where: { id },
      data: {
        status: 'ATTACHED',
        proposalId,
        attachedAt,
      },
    });
  }

  async markRemoved(tx: DbTx, id: string, removedByEmployeeId: string, removedAt: Date): Promise<void> {
    await tx.budgetAttachment.update({
      where: { id },
      data: {
        status: 'REMOVED',
        removedByEmployeeId,
        removedAt,
      },
    });
  }

  async markQuarantined(tx: DbTx, id: string): Promise<void> {
    await tx.budgetAttachment.update({
      where: { id },
      data: {
        status: 'QUARANTINED',
      },
    });
  }

  async markExpired(tx: DbTx, id: string): Promise<void> {
    await tx.budgetAttachment.update({
      where: { id },
      data: {
        status: 'EXPIRED',
      },
    });
  }

  async markDiscarded(tx: DbTx, id: string): Promise<void> {
    await tx.budgetAttachment.update({
      where: { id },
      data: {
        status: 'DISCARDED',
      },
    });
  }

  async pageByProposal(
    proposalId: string,
    pagination: { skip: number; take: number },
  ): Promise<{ items: BudgetAttachmentRecord[]; totalItems: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const items = await tx.budgetAttachment.findMany({
          where: { proposalId, status: 'ATTACHED' },
          orderBy: [{ attachedAt: 'asc' }, { id: 'asc' }],
          skip: pagination.skip,
          take: pagination.take,
        });
        const totalItems = await tx.budgetAttachment.count({ where: { proposalId, status: 'ATTACHED' } });
        return { items: items.map(toRecord), totalItems };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async pageByVersionFull(
    versionId: string,
    pagination: { skip: number; take: number },
  ): Promise<{ items: BudgetAttachmentRecord[]; totalItems: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const where = {
          versionId,
          status: { in: ['ATTACHED' as const, 'REMOVED' as const] },
        };
        const items = await tx.budgetAttachment.findMany({
          where,
          orderBy: [{ attachedAt: 'asc' }, { id: 'asc' }],
          skip: pagination.skip,
          take: pagination.take,
        });
        const totalItems = await tx.budgetAttachment.count({ where });
        return { items: items.map(toRecord), totalItems };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** The documents of a version as they were at its last send (`D-S24`): attached by `sentAt`, not removed before it. */
  async pageByVersionAsLastSent(
    versionId: string,
    sentAt: Date,
    pagination: { skip: number; take: number },
  ): Promise<{ items: BudgetAttachmentRecord[]; totalItems: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const where = {
          versionId,
          status: { in: ['ATTACHED' as const, 'REMOVED' as const] },
          attachedAt: { lte: sentAt },
          OR: [{ removedAt: null }, { removedAt: { gt: sentAt } }],
        };
        const items = await tx.budgetAttachment.findMany({
          where,
          orderBy: [{ attachedAt: 'asc' }, { id: 'asc' }],
          skip: pagination.skip,
          take: pagination.take,
        });
        const totalItems = await tx.budgetAttachment.count({ where });
        return { items: items.map(toRecord), totalItems };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async pageMine(
    employeeId: string,
    pagination: { skip: number; take: number },
  ): Promise<{ items: BudgetAttachmentRecord[]; totalItems: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const where = {
          uploadedByEmployeeId: employeeId,
          status: { in: ['AWAITING_UPLOAD' as const, 'UPLOADED' as const] },
        };
        const items = await tx.budgetAttachment.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: pagination.skip,
          take: pagination.take,
        });
        const totalItems = await tx.budgetAttachment.count({ where });
        return { items: items.map(toRecord), totalItems };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}

function toRecord(row: Prisma.BudgetAttachmentGetPayload<object>): BudgetAttachmentRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    target: row.target,
    status: row.status,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    objectKey: row.objectKey,
    finalObjectKey: row.finalObjectKey,
    uploadedByEmployeeId: row.uploadedByEmployeeId,
    proposalId: row.proposalId,
    versionId: row.versionId,
    attachedAt: row.attachedAt,
    removedAt: row.removedAt,
    removedByEmployeeId: row.removedByEmployeeId,
    createdAt: row.createdAt,
  };
}
