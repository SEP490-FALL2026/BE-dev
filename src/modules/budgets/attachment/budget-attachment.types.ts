export type BudgetAttachmentTarget = 'PROPOSAL' | 'VERSION';

export type BudgetAttachmentStatus =
  'AWAITING_UPLOAD' | 'UPLOADED' | 'ATTACHED' | 'REMOVED' | 'QUARANTINED' | 'EXPIRED' | 'DISCARDED';

export interface BudgetAttachmentRecord {
  id: string;
  organizationId: string;
  target: BudgetAttachmentTarget;
  status: BudgetAttachmentStatus;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  objectKey: string;
  finalObjectKey: string | null;
  uploadedByEmployeeId: string;
  proposalId: string | null;
  versionId: string | null;
  attachedAt: Date | null;
  removedAt: Date | null;
  removedByEmployeeId: string | null;
  createdAt: Date;
}
