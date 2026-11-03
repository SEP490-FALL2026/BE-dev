import type {
  BudgetAttachmentSummaryWire,
  BudgetAttachmentWire,
  BudgetUploadSummaryWire,
} from './budget-attachment.dto';
import { expiresAt } from './budget-attachment.policy';
import type { BudgetAttachmentRecord } from './budget-attachment.types';

export interface EmployeeBrief {
  employeeId: string;
  employeeCode: string;
  fullName: string;
}

export function toBudgetAttachmentWire(
  record: BudgetAttachmentRecord,
  uploadedBy: EmployeeBrief | null,
  removedBy: EmployeeBrief | null = null,
): BudgetAttachmentWire {
  return {
    id: record.id,
    target: record.target,
    status: record.status,
    fileName: record.fileName,
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    uploadedBy,
    createdAt: record.createdAt.toISOString(),
    proposalId: record.proposalId,
    versionId: record.versionId,
    attachedAt: record.attachedAt?.toISOString() ?? null,
    removedAt: record.removedAt?.toISOString() ?? null,
    removedBy,
  };
}

export function toBudgetAttachmentSummaryWire(
  record: BudgetAttachmentRecord,
  uploadedBy: EmployeeBrief | null,
  options?: { status?: 'ATTACHED' | 'REMOVED'; removedAt?: string | null },
): BudgetAttachmentSummaryWire {
  // A summary row is attached or removed, so it has been attached: no silent fallback to another time.
  if (record.attachedAt === null) throw new Error(`Budget attachment ${record.id} is in a summary without attached_at`);
  const status = options?.status ?? (record.status as 'ATTACHED' | 'REMOVED');
  const removedAt = options?.removedAt !== undefined ? options.removedAt : (record.removedAt?.toISOString() ?? null);

  return {
    id: record.id,
    fileName: record.fileName,
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    status,
    uploadedBy,
    attachedAt: record.attachedAt.toISOString(),
    removedAt,
  };
}

export function toBudgetUploadSummaryWire(record: BudgetAttachmentRecord): BudgetUploadSummaryWire {
  const status = record.status as 'AWAITING_UPLOAD' | 'UPLOADED';
  return {
    id: record.id,
    target: record.target,
    status,
    fileName: record.fileName,
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    versionId: record.versionId,
    createdAt: record.createdAt.toISOString(),
    expiresAt: expiresAt(status, record.createdAt).toISOString(),
  };
}
