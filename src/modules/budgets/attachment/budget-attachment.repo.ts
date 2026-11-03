import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
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

  async lock(tx: DbTx, id: string): Promise<BudgetAttachmentRecord | null> {
    const rows = await tx.$queryRaw<Prisma.BudgetAttachmentGetPayload<object>[]>`
      SELECT * FROM "budget_attachments" WHERE "id" = ${id}::uuid FOR UPDATE
    `;
    return rows.length > 0 ? toRecord(rows[0]) : null;
  }

  async lockManyAsc(tx: DbTx, ids: string[]): Promise<BudgetAttachmentRecord[]> {
    if (ids.length === 0) return [];
    const sortedIds = [...ids].sort();
    const rows = await tx.$queryRaw<Prisma.BudgetAttachmentGetPayload<object>[]>`
      SELECT * FROM "budget_attachments"
      WHERE "id" IN (${Prisma.join(sortedIds.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY "id" ASC
      FOR UPDATE
    `;
    return rows.map(toRecord);
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

  async pageByVersionAsLastSent(
    versionId: string,
    sentAt: Date,
    pagination: { skip: number; take: number },
  ): Promise<{ items: BudgetAttachmentRecord[]; totalItems: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const countRows = await tx.$queryRaw<{ count: bigint }[]>`
          SELECT count(*)::bigint AS count
          FROM "budget_attachments" a
          WHERE a."version_id" = ${versionId}::uuid
            AND a."status"::text IN ('ATTACHED', 'REMOVED')
            AND a."attached_at" <= ${sentAt}
            AND (a."removed_at" IS NULL OR a."removed_at" > ${sentAt})
        `;
        const totalItems = Number(countRows[0]?.count ?? 0);

        const rows = await tx.$queryRaw<Prisma.BudgetAttachmentGetPayload<object>[]>`
          SELECT *
          FROM "budget_attachments" a
          WHERE a."version_id" = ${versionId}::uuid
            AND a."status"::text IN ('ATTACHED', 'REMOVED')
            AND a."attached_at" <= ${sentAt}
            AND (a."removed_at" IS NULL OR a."removed_at" > ${sentAt})
          ORDER BY a."attached_at" ASC, a."id" ASC
          OFFSET ${pagination.skip}
          LIMIT ${pagination.take}
        `;

        return { items: rows.map(toRecord), totalItems };
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

  async findExpiredCandidates(now: Date, limit: number): Promise<BudgetAttachmentRecord[]> {
    const awaitingCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const uploadedCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.$queryRaw<Prisma.BudgetAttachmentGetPayload<object>[]>`
      SELECT * FROM "budget_attachments"
      WHERE ("status" = 'AWAITING_UPLOAD' AND "created_at" < ${awaitingCutoff})
         OR ("status" = 'UPLOADED' AND "created_at" < ${uploadedCutoff})
      ORDER BY "created_at" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `;
    return rows.map(toRecord);
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
