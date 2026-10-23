import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { DocumentPurpose, DocumentStatus } from './contract.policy';

export interface DocumentRecord {
  id: string;
  purpose: DocumentPurpose;
  status: DocumentStatus;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  objectKey: string;
  /** Where the bytes that were looked at are kept; null until the file is uploaded and kept. */
  finalObjectKey: string | null;
  uploadedByAppUserId: string;
  contractId: string | null;
  attachedAt: Date | null;
  createdAt: Date;
}

/**
 * The one writer of `document_attachments`: where a file is and what it is, never its bytes and never a link. A file
 * moves one way (the database refuses anything else) and is never deleted.
 */
@Injectable()
export class DocumentRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(
    tx: DbTx,
    input: {
      organizationId: string;
      purpose: DocumentPurpose;
      fileName: string;
      contentType: string;
      sizeBytes: number;
      objectKey: string;
      uploadedByAppUserId: string;
    },
  ): Promise<DocumentRecord> {
    return tx.documentAttachment.create({ data: input });
  }

  async find(id: string, tx?: DbTx): Promise<DocumentRecord | null> {
    return (tx ?? this.prisma).documentAttachment.findUnique({ where: { id } });
  }

  /** The row locked `FOR UPDATE` for the rest of the transaction, so two steps on one file queue; or null. */
  async lock(tx: DbTx, id: string): Promise<DocumentRecord | null> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM document_attachments WHERE id = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;

    return this.find(id, tx);
  }

  async markUploaded(tx: DbTx, id: string, finalObjectKey: string): Promise<void> {
    await tx.documentAttachment.update({ where: { id }, data: { status: 'PENDING_ATTACH', finalObjectKey } });
  }

  async markExpired(tx: DbTx, id: string): Promise<void> {
    await tx.documentAttachment.update({ where: { id }, data: { status: 'EXPIRED' } });
  }

  /** The files still awaiting an upload that were declared before `before`, the oldest first, at most `limit`. */
  async findAbandoned(before: Date, limit: number): Promise<{ id: string; objectKey: string }[]> {
    return this.prisma.documentAttachment.findMany({
      where: { status: 'AWAITING_UPLOAD', createdAt: { lt: before } },
      select: { id: true, objectKey: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }

  async markQuarantined(tx: DbTx, id: string): Promise<void> {
    await tx.documentAttachment.update({ where: { id }, data: { status: 'QUARANTINED' } });
  }

  async markAttached(tx: DbTx, id: string, contractId: string, now: Date): Promise<void> {
    await tx.documentAttachment.update({
      where: { id },
      data: { status: 'READY', contractId, attachedAt: now },
    });
  }
}
