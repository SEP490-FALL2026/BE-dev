import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetAttachmentCompletionService } from './budget-attachment-completion.service';
import type { BudgetAttachmentRecord } from './budget-attachment.types';

const FINAL_KEY = 'budget-documents/2026/11/final-copy';
const PENDING_KEY = 'pending-documents/2026/11/pending-upload';

const record = (overrides: Partial<BudgetAttachmentRecord> = {}): BudgetAttachmentRecord => ({
  id: 'a1',
  organizationId: 'org',
  target: 'VERSION',
  status: 'AWAITING_UPLOAD',
  fileName: 'bao-gia.pdf',
  contentType: 'application/pdf',
  sizeBytes: 2048,
  objectKey: PENDING_KEY,
  finalObjectKey: null,
  uploadedByEmployeeId: 'e1',
  proposalId: null,
  versionId: 'v1',
  attachedAt: null,
  removedAt: null,
  removedByEmployeeId: null,
  createdAt: new Date(),
  ...overrides,
});

describe('BudgetAttachmentCompletionService: the copy and the upload around the commit', () => {
  const actor = {
    employeeId: 'e1',
    roles: ['FINANCE', 'MANAGER'],
    directRoles: ['FINANCE', 'MANAGER'],
  } as unknown as AuthenticatedPrincipal;

  const build = (options: {
    target: 'VERSION' | 'PROPOSAL';
    commit: 'fails' | 'succeeds';
    rowAfter: Partial<BudgetAttachmentRecord>;
  }) => {
    const initial = record({ target: options.target, versionId: options.target === 'VERSION' ? 'v1' : null });
    const finds = jest.fn<Promise<BudgetAttachmentRecord | null>, [string]>();
    // First read: the declared row. Later reads: what the database holds after the commit did or did not happen.
    finds.mockResolvedValueOnce(initial).mockResolvedValue({ ...initial, ...options.rowAfter });
    const attachments = { find: finds };
    const runner = {
      run: jest.fn(() => {
        return options.commit === 'fails' ? Promise.reject(new Error('The connection was lost.')) : Promise.resolve();
      }),
    };
    const storage = { delete: jest.fn(() => Promise.resolve()) };
    const service = new BudgetAttachmentCompletionService(
      runner as never,
      attachments as never,
      { begin: jest.fn(() => Promise.resolve(new Date())) } as never,
      {} as never,
      { inspect: jest.fn(() => Promise.resolve({ outcome: 'KEPT', finalObjectKey: FINAL_KEY })) } as never,
      {} as never,
      {
        people: jest.fn(() => Promise.resolve(new Map())),
        today: jest.fn(() => Promise.resolve('2026-11-09')),
        requireHeadOfAnyUnit: jest.fn(() => Promise.resolve()),
      } as never,
      storage as never,
    );

    return { service, storage };
  };

  it.each(['VERSION', 'PROPOSAL'] as const)(
    'takes its copy back when the commit of a %s file failed and the row does not name it',
    async (target) => {
      const { service, storage } = build({ target, commit: 'fails', rowAfter: {} });

      await expect(service.complete(actor, 'a1')).rejects.toThrow('The connection was lost.');

      expect(storage.delete).toHaveBeenCalledWith(FINAL_KEY);
      // The upload stays: the same call works again.
      expect(storage.delete).not.toHaveBeenCalledWith(PENDING_KEY);
    },
  );

  it.each(['VERSION', 'PROPOSAL'] as const)(
    'keeps the copy of a %s file whose commit did happen although the answer was lost',
    async (target) => {
      const { service, storage } = build({
        target,
        commit: 'fails',
        rowAfter: { status: target === 'VERSION' ? 'ATTACHED' : 'UPLOADED', finalObjectKey: FINAL_KEY },
      });

      await expect(service.complete(actor, 'a1')).rejects.toThrow('The connection was lost.');

      expect(storage.delete).not.toHaveBeenCalled();
    },
  );

  it.each(['VERSION', 'PROPOSAL'] as const)('deletes the upload after the commit of a %s file', async (target) => {
    const { service, storage } = build({
      target,
      commit: 'succeeds',
      rowAfter: { status: target === 'VERSION' ? 'ATTACHED' : 'UPLOADED', finalObjectKey: FINAL_KEY },
    });

    await service.complete(actor, 'a1');

    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledWith(PENDING_KEY);
  });
});
