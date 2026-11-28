import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { FakeObjectStorage } from '../../../../test/support/fake-object-storage';
import {
  DocumentAlreadyAttachedError,
  DocumentNotFoundError,
  DocumentNotReadyToAttachError,
  DocumentPurposeMismatchError,
} from './contract.errors';
import type { DocumentRecord } from './document.repo';
import { ProvisioningEvidenceDocumentService } from './provisioning-evidence-document.service';

const actor: AuthenticatedPrincipal = {
  subject: 'u',
  appUserId: 'u',
  sessionId: 's',
  employeeId: 'e',
  roles: ['IT_ADMIN'],
  directRoles: ['IT_ADMIN'],
};
const tx = {} as DbTx;
const now = new Date('2026-11-28T00:00:00Z');
const document = (over: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id: 'a',
  purpose: 'PROVISIONING_EVIDENCE',
  status: 'PENDING_ATTACH',
  fileName: 'a.pdf',
  contentType: 'application/pdf',
  sizeBytes: 20,
  objectKey: 'pending/a',
  finalObjectKey: 'kept/a',
  uploadedByAppUserId: 'u',
  contractId: null,
  signerEmployeeId: null,
  attachedAt: now,
  createdAt: now,
  ...over,
});
function setup() {
  const repo = {
    lock: jest.fn((_tx: DbTx, id: string) => Promise.resolve(document({ id }))),
    markAttachedToProvisioningTask: jest.fn(),
    listReadyOfProvisioningTask: jest.fn(),
    findReadyOfProvisioningTask: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const storage = new FakeObjectStorage();
  const runner = { run: <T>(work: (tx: DbTx) => Promise<T>) => work(tx) };
  const service = new ProvisioningEvidenceDocumentService(
    repo as never,
    { getOrganization: jest.fn().mockResolvedValue({ id: 'org' }) } as never,
    audit as never,
    runner as never,
    storage,
  );
  return { service, repo, audit, storage };
}

describe('provisioning evidence documents in catalog', () => {
  it('takes document locks in canonical UUID order for mixed-case facade callers', async () => {
    const { service, repo } = setup();
    const first = 'a0000000-0000-4000-8000-000000000001';
    const second = 'B0000000-0000-4000-8000-000000000002';
    await service.attach(tx, actor, {
      documentIds: [second, first],
      provisioningTaskId: 'task',
      purpose: 'PROVISIONING_EVIDENCE',
    });
    expect(repo.lock.mock.calls.map((call) => call[1])).toEqual([first, second.toLowerCase()]);
  });
  it('locks ids in ascending order and attaches/audits each file in the supplied transaction', async () => {
    const { service, repo, audit } = setup();
    await service.attach(tx, actor, {
      documentIds: ['b', 'a'],
      provisioningTaskId: 'task',
      purpose: 'PROVISIONING_EVIDENCE',
    });
    expect(repo.lock.mock.calls.map((call) => call[1])).toEqual(['a', 'b']);
    expect(repo.markAttachedToProvisioningTask).toHaveBeenNthCalledWith(1, tx, 'a', 'task', expect.any(Date));
    expect(repo.markAttachedToProvisioningTask).toHaveBeenNthCalledWith(2, tx, 'b', 'task', expect.any(Date));
    expect(audit.record).toHaveBeenNthCalledWith(
      1,
      tx,
      expect.objectContaining({
        action: 'DOCUMENT.ATTACHED',
        resourceId: 'a',
        after: { status: 'READY', provisioningTaskId: 'task' },
      }),
    );
  });

  it.each([
    ['uploader', { uploadedByAppUserId: 'other' }, DocumentNotFoundError],
    ['purpose', { purpose: 'ACCESS_CUT_EVIDENCE' }, DocumentPurposeMismatchError],
    ['attached', { status: 'READY' }, DocumentAlreadyAttachedError],
    ['upload', { status: 'AWAITING_UPLOAD' }, DocumentNotReadyToAttachError],
  ] as const)('refuses invalid %s before writing', async (_name, over, error) => {
    const { service, repo, audit } = setup();
    repo.lock.mockResolvedValue(document(over));
    await expect(
      service.attach(tx, actor, { documentIds: ['a'], provisioningTaskId: 'task', purpose: 'PROVISIONING_EVIDENCE' }),
    ).rejects.toBeInstanceOf(error);
    expect(repo.markAttachedToProvisioningTask).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('refuses a missing file with DocumentNotFoundError', async () => {
    const { service, repo } = setup();
    repo.lock.mockResolvedValue(null as never);
    await expect(
      service.attach(tx, actor, {
        documentIds: ['missing'],
        provisioningTaskId: 'task',
        purpose: 'PROVISIONING_EVIDENCE',
      }),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
  });

  it('reads the bounded projection through the repo', async () => {
    const { service, repo } = setup();
    repo.listReadyOfProvisioningTask.mockResolvedValue([]);
    await expect(service.list('task', tx)).resolves.toEqual([]);
    expect(repo.listReadyOfProvisioningTask).toHaveBeenCalledWith('task', tx);
  });

  it('signs the kept object for 300 seconds and audits only expiry', async () => {
    const { service, repo, storage, audit } = setup();
    repo.findReadyOfProvisioningTask.mockResolvedValue(document({ status: 'READY' }));
    const result = await service.issueLink(actor, { provisioningTaskId: 'task', documentId: 'a' });
    expect(repo.findReadyOfProvisioningTask).toHaveBeenCalledWith('task', 'a');
    expect(storage.downloadLinks[0]).toMatchObject({
      key: 'kept/a',
      fileName: 'a.pdf',
      contentType: 'application/pdf',
      expiresInSeconds: 300,
    });
    expect(result?.url).toContain('https://storage.example/download/');
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'DOCUMENT.LINK_ISSUED',
        after: { expiresAt: result?.expiresAt.toISOString() },
      }),
    );
  });

  it('returns null for a file outside the task and never signs or audits it', async () => {
    const { service, repo, storage, audit } = setup();
    repo.findReadyOfProvisioningTask.mockResolvedValue(null);
    await expect(service.issueLink(actor, { provisioningTaskId: 'other', documentId: 'a' })).resolves.toBeNull();
    expect(storage.downloadLinks).toEqual([]);
    expect(audit.record).not.toHaveBeenCalled();
  });
});
