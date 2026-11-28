import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ProvisioningEvidenceFile } from '../public/catalog.types';
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
  /** The person who signed a `SIGNATURE_RECORD`; null for every other file. */
  signerEmployeeId: string | null;
  attachedAt: Date | null;
  createdAt: Date;
}

/** A file attached to a contract as the contract shows it: what it is, never where its bytes are. */
export interface AttachedDocumentRow {
  id: string;
  purpose: DocumentPurpose;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  attachedAt: Date;
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

  /** The files attached to a contract, the last attached first, at most `limit`. */
  async attachedTo(contractId: string, limit: number): Promise<AttachedDocumentRow[]> {
    const rows = await this.prisma.documentAttachment.findMany({
      where: { contractId, status: 'READY' },
      select: {
        id: true,
        purpose: true,
        fileName: true,
        contentType: true,
        sizeBytes: true,
        attachedAt: true,
        createdAt: true,
      },
      orderBy: [{ attachedAt: 'desc' }, { id: 'asc' }],
      take: limit,
    });

    // A file is READY exactly when it has its owner and the time it got it (a CHECK), so the second is never missing.
    return rows.map(({ createdAt, attachedAt, ...document }) => ({ ...document, attachedAt: attachedAt ?? createdAt }));
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

  /** A purchase document belongs to the purchase invoice it came with, in the transaction of the caller. */
  async markAttachedToPurchaseInvoice(tx: DbTx, id: string, purchaseInvoiceId: string, now: Date): Promise<void> {
    await tx.documentAttachment.update({
      where: { id },
      data: { status: 'READY', purchaseInvoiceId, attachedAt: now },
    });
  }

  /** A proof of payment belongs to the case outside the process it was closed with, in the transaction of the caller. */
  async markAttachedToOutOfProcessCase(tx: DbTx, id: string, outOfProcessCaseId: string, now: Date): Promise<void> {
    await tx.documentAttachment.update({
      where: { id },
      data: { status: 'READY', outOfProcessCaseId, attachedAt: now },
    });
  }

  /** A signed record belongs to the person who signed it, in the transaction of the caller. */
  async markAttachedToSigner(tx: DbTx, id: string, signerEmployeeId: string, now: Date): Promise<void> {
    await tx.documentAttachment.update({
      where: { id },
      data: { status: 'READY', signerEmployeeId, attachedAt: now },
    });
  }

  async markAttachedToProvisioningTask(tx: DbTx, id: string, provisioningTaskId: string, now: Date): Promise<void> {
    await tx.documentAttachment.update({
      where: { id },
      data: { status: 'READY', provisioningTaskId, attachedAt: now },
    });
  }

  async listReadyOfProvisioningTask(provisioningTaskId: string, tx?: DbTx): Promise<ProvisioningEvidenceFile[]> {
    const rows = await (tx ?? this.prisma).documentAttachment.findMany({
      where: { provisioningTaskId, status: 'READY', purpose: { in: ['PROVISIONING_EVIDENCE', 'ACCESS_CUT_EVIDENCE'] } },
      select: { id: true, purpose: true, fileName: true, contentType: true, sizeBytes: true, attachedAt: true },
      orderBy: [{ attachedAt: 'asc' }, { id: 'asc' }],
      take: 6,
    });
    return rows.flatMap(({ purpose, attachedAt, ...row }) =>
      (purpose === 'PROVISIONING_EVIDENCE' || purpose === 'ACCESS_CUT_EVIDENCE') && attachedAt !== null
        ? [{ ...row, purpose, attachedAt }]
        : [],
    );
  }

  findReadyOfProvisioningTask(provisioningTaskId: string, id: string): Promise<DocumentRecord | null> {
    return this.prisma.documentAttachment.findFirst({
      where: {
        id,
        provisioningTaskId,
        status: 'READY',
        purpose: { in: ['PROVISIONING_EVIDENCE', 'ACCESS_CUT_EVIDENCE'] },
      },
    });
  }
}
