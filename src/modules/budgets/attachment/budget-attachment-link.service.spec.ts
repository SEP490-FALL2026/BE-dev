import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { ObjectStoragePort } from '../../../infrastructure/object-storage/object-storage.port';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { BudgetFactsService } from '../budget/budget-facts.service';
import type { ProposalRepo } from '../budget/proposal.repo';
import type { VersionRepo } from '../budget/version.repo';
import { BudgetAttachmentLinkService } from './budget-attachment-link.service';
import { BudgetAttachmentNotFoundError } from './budget-attachment.errors';
import type { BudgetAttachmentRepo } from './budget-attachment.repo';
import type { BudgetAttachmentRecord } from './budget-attachment.types';

interface MockAttachments {
  find: jest.Mock<Promise<BudgetAttachmentRecord | null>, [string, DbTx]>;
}

interface MockFacts {
  today: jest.Mock<Promise<Date>, [Date, DbTx]>;
  isSpendingApprover: jest.Mock<Promise<boolean>, [string, DbTx]>;
  headedCostCenter: jest.Mock<Promise<string | null>, [string, Date, DbTx]>;
}

interface MockProposals {
  findById: jest.Mock<Promise<{ id: string; costCenterId: string } | null>, [string, DbTx]>;
}

interface MockVersions {
  findById: jest.Mock<Promise<{ id: string; costCenterId: string; sentAt: Date | null } | null>, [string, DbTx]>;
}

interface MockAudit {
  record: jest.Mock<Promise<void>, [DbTx, unknown]>;
}

interface MockStorage {
  createDownloadUrl: jest.Mock<Promise<string>, [string, number]>;
}

interface MockRunner {
  run: jest.Mock<Promise<unknown>, [(tx: DbTx) => Promise<unknown>]>;
}

describe('BudgetAttachmentLinkService', () => {
  let service: BudgetAttachmentLinkService;
  let attachments: MockAttachments;
  let facts: MockFacts;
  let proposals: MockProposals;
  let versions: MockVersions;
  let audit: MockAudit;
  let storage: MockStorage;
  let runner: MockRunner;

  const actor: AuthenticatedPrincipal = {
    subject: 'acc-1',
    sessionId: 'sess-1',
    appUserId: 'user-1',
    employeeId: 'emp-1',
    directRoles: ['MANAGER'],
    roles: ['MANAGER'],
  };

  const sampleRecord: BudgetAttachmentRecord = {
    id: 'att-1',
    organizationId: 'org-1',
    target: 'PROPOSAL',
    status: 'ATTACHED',
    fileName: 'quote.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1024,
    objectKey: 'pending/att-1',
    finalObjectKey: 'documents/att-1.pdf',
    uploadedByEmployeeId: 'emp-1',
    createdAt: new Date('2026-11-01T00:00:00Z'),
    proposalId: 'prop-1',
    versionId: null,
    attachedAt: new Date('2026-11-01T01:00:00Z'),
    removedAt: null,
    removedByEmployeeId: null,
  };

  beforeEach(() => {
    attachments = {
      find: jest.fn<Promise<BudgetAttachmentRecord | null>, [string, DbTx]>(),
    };
    facts = {
      today: jest.fn<Promise<Date>, [Date, DbTx]>().mockResolvedValue(new Date('2026-11-03')),
      isSpendingApprover: jest.fn<Promise<boolean>, [string, DbTx]>().mockResolvedValue(false),
      headedCostCenter: jest.fn<Promise<string | null>, [string, Date, DbTx]>().mockResolvedValue('cc-1'),
    };
    proposals = {
      findById: jest.fn<Promise<{ id: string; costCenterId: string } | null>, [string, DbTx]>(),
    };
    versions = {
      findById: jest.fn<Promise<{ id: string; costCenterId: string; sentAt: Date | null } | null>, [string, DbTx]>(),
    };
    audit = {
      record: jest.fn<Promise<void>, [DbTx, unknown]>().mockResolvedValue(undefined),
    };
    storage = {
      createDownloadUrl: jest
        .fn<Promise<string>, [string, number]>()
        .mockResolvedValue('https://storage.local/download/att-1'),
    };
    runner = {
      run: jest
        .fn<Promise<unknown>, [(tx: DbTx) => Promise<unknown>]>()
        .mockImplementation((fn: (tx: DbTx) => Promise<unknown>) => fn({} as DbTx)),
    };

    service = new BudgetAttachmentLinkService(
      runner as unknown as TransactionRunner,
      attachments as unknown as BudgetAttachmentRepo,
      facts as unknown as BudgetFactsService,
      proposals as unknown as ProposalRepo,
      versions as unknown as VersionRepo,
      audit as unknown as AuditApi,
      storage as unknown as ObjectStoragePort,
    );
  });

  it('throws 404 when attachment not found or has no finalObjectKey', async () => {
    attachments.find.mockResolvedValue(null);
    await expect(service.issue(actor, 'missing')).rejects.toThrow(BudgetAttachmentNotFoundError);

    attachments.find.mockResolvedValue({ ...sampleRecord, finalObjectKey: null });
    await expect(service.issue(actor, 'att-1')).rejects.toThrow(BudgetAttachmentNotFoundError);
  });

  it('throws 404 when status is not UPLOADED, ATTACHED, or REMOVED', async () => {
    attachments.find.mockResolvedValue({ ...sampleRecord, status: 'AWAITING_UPLOAD' });
    await expect(service.issue(actor, 'att-1')).rejects.toThrow(BudgetAttachmentNotFoundError);

    attachments.find.mockResolvedValue({ ...sampleRecord, status: 'QUARANTINED' });
    await expect(service.issue(actor, 'att-1')).rejects.toThrow(BudgetAttachmentNotFoundError);
  });

  it('allows uploader to download an UPLOADED file before submission', async () => {
    attachments.find.mockResolvedValue({
      ...sampleRecord,
      status: 'UPLOADED',
      uploadedByEmployeeId: 'emp-1',
    });

    const result = await service.issue(actor, 'att-1');
    expect(result.url).toBe('https://storage.local/download/att-1');
    expect(audit.record).toHaveBeenCalled();
  });

  it('refuses other users from downloading an unattached UPLOADED file', async () => {
    attachments.find.mockResolvedValue({
      ...sampleRecord,
      status: 'UPLOADED',
      uploadedByEmployeeId: 'emp-other',
    });

    await expect(service.issue(actor, 'att-1')).rejects.toThrow(BudgetAttachmentNotFoundError);
  });

  it('allows Head of Cost Center to download proposal attachment of own Cost Center', async () => {
    attachments.find.mockResolvedValue(sampleRecord);
    proposals.findById.mockResolvedValue({
      id: 'prop-1',
      costCenterId: 'cc-1',
    });

    const result = await service.issue(actor, 'att-1');
    expect(result.url).toBe('https://storage.local/download/att-1');
  });

  it('refuses Head of different Cost Center from downloading proposal attachment', async () => {
    attachments.find.mockResolvedValue(sampleRecord);
    proposals.findById.mockResolvedValue({
      id: 'prop-1',
      costCenterId: 'cc-2',
    });

    await expect(service.issue(actor, 'att-1')).rejects.toThrow(BudgetAttachmentNotFoundError);
  });

  it('handles AS_LAST_SENT view for version attachments', async () => {
    const versionRecord: BudgetAttachmentRecord = {
      ...sampleRecord,
      target: 'VERSION',
      proposalId: null,
      versionId: 'ver-1',
      attachedAt: new Date('2026-11-01T10:00:00Z'),
    };
    attachments.find.mockResolvedValue(versionRecord);
    versions.findById.mockResolvedValue({
      id: 'ver-1',
      costCenterId: 'cc-1',
      sentAt: new Date('2026-11-01T12:00:00Z'),
    });

    // Attached before sentAt -> OK
    const result = await service.issue(actor, 'att-1');
    expect(result.url).toBe('https://storage.local/download/att-1');

    // Attached after sentAt -> 404
    attachments.find.mockResolvedValue({
      ...versionRecord,
      attachedAt: new Date('2026-11-01T13:00:00Z'),
    });
    await expect(service.issue(actor, 'att-1')).rejects.toThrow(BudgetAttachmentNotFoundError);

    // Removed before sentAt -> 404
    attachments.find.mockResolvedValue({
      ...versionRecord,
      attachedAt: new Date('2026-11-01T10:00:00Z'),
      removedAt: new Date('2026-11-01T11:00:00Z'),
    });
    await expect(service.issue(actor, 'att-1')).rejects.toThrow(BudgetAttachmentNotFoundError);

    // Removed after sentAt -> OK (it was in the package when sent)
    attachments.find.mockResolvedValue({
      ...versionRecord,
      attachedAt: new Date('2026-11-01T10:00:00Z'),
      removedAt: new Date('2026-11-01T13:00:00Z'),
    });
    const result2 = await service.issue(actor, 'att-1');
    expect(result2.url).toBe('https://storage.local/download/att-1');
  });
});
