import { ApiException } from '../../../../infrastructure/http/errors/api.exception';
import { toProvisioningApiException } from '../provisioning.http-errors';
import { ProvisioningEvidenceFileNotFoundError } from '../provisioning.errors';
import { EmployeeNotStartedError } from '../../../organization/public/organization.errors';
import { ProvisioningTaskNotFoundError } from '../../public/licensing.errors';
import { ProvisioningNotInChargeError } from '../provisioning.errors';
import { DocumentAttachRefusedError } from '../../../catalog/public/catalog.errors';
import { ProvisioningEvidenceFilesService } from './provisioning-evidence-files.service';

const actor = { appUserId: 'u' } as never;
const tx = {} as never;
describe('attach evidence through the public catalog facade', () => {
  it.each([undefined, []])('does not call catalog for %j', async (ids) => {
    const attachProvisioningEvidence = jest.fn();
    const service = attaching({ attachProvisioningEvidence });
    await expect(service.attach(tx, actor, 'task', ids, 'PROVISIONING_EVIDENCE')).resolves.toEqual([]);
    expect(attachProvisioningEvidence).not.toHaveBeenCalled();
  });
  it('sorts ids and forwards the same transaction, actor, task and purpose', async () => {
    const attachProvisioningEvidence = jest.fn();
    const service = attaching({ attachProvisioningEvidence });
    await expect(service.attach(tx, actor, 'task', ['b', 'a'], 'ACCESS_CUT_EVIDENCE')).resolves.toEqual(['a', 'b']);
    expect(attachProvisioningEvidence).toHaveBeenCalledWith(tx, actor, {
      documentIds: ['a', 'b'],
      provisioningTaskId: 'task',
      purpose: 'ACCESS_CUT_EVIDENCE',
    });
  });
  it.each(['NOT_FOUND', 'ALREADY_ATTACHED', 'NOT_READY_TO_ATTACH', 'PURPOSE_MISMATCH'] as const)(
    'maps catalog %s into a task refusal',
    async (problem) => {
      const service = attaching({
        attachProvisioningEvidence: () => Promise.reject(new DocumentAttachRefusedError(problem)),
      });
      await expect(service.attach(tx, actor, 'task', ['a'], 'PROVISIONING_EVIDENCE')).rejects.toMatchObject({
        name: 'ProvisioningEvidenceFileInvalidError',
        problem,
      });
    },
  );
});

function attaching(catalog: object) {
  return new ProvisioningEvidenceFilesService(catalog as never, {} as never, {} as never, {} as never);
}
const reader = {
  subject: 'u',
  appUserId: 'u',
  employeeId: 'it',
  sessionId: 's',
  roles: ['IT_ADMIN'],
  directRoles: ['IT_ADMIN'],
};
function reading() {
  const catalog = {
    listProvisioningEvidence: jest.fn().mockResolvedValue([]),
    issueProvisioningEvidenceLink: jest.fn().mockResolvedValue(null),
  };
  const repo = {
    findInOrganization: jest.fn().mockResolvedValue({
      id: 'task',
      status: 'COMPLETED',
      completedByAppUserId: 'u',
      assignment: { employeeId: 'emp' },
    }),
  };
  const frame = { requireActingItAdmin: jest.fn().mockResolvedValue({ bySubstitute: false }) };
  const service = new ProvisioningEvidenceFilesService(
    catalog as never,
    repo as never,
    frame as never,
    { getOrganization: () => Promise.resolve({ id: 'org' }) } as never,
  );
  return { service, catalog, repo, frame };
}

describe('reading task evidence with current acting responsibility', () => {
  it('lets Super Admin read and maps both stages without asking for IT responsibility', async () => {
    const h = reading();
    const attachedAt = new Date('2026-11-28T00:00:00Z');
    h.catalog.listProvisioningEvidence.mockResolvedValue([
      {
        id: 'a',
        purpose: 'PROVISIONING_EVIDENCE',
        fileName: 'a.pdf',
        contentType: 'application/pdf',
        sizeBytes: 10,
        attachedAt,
      },
      {
        id: 'b',
        purpose: 'ACCESS_CUT_EVIDENCE',
        fileName: 'b.png',
        contentType: 'image/png',
        sizeBytes: 20,
        attachedAt,
      },
    ]);
    await expect(h.service.list({ ...reader, roles: ['SUPER_ADMIN'] }, 'task')).resolves.toEqual([
      { id: 'a', stage: 'COMPLETION', fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 10, attachedAt },
      { id: 'b', stage: 'ACCESS_CUT', fileName: 'b.png', contentType: 'image/png', sizeBytes: 20, attachedAt },
    ]);
    expect(h.frame.requireActingItAdmin).not.toHaveBeenCalled();
    expect(h.repo.findInOrganization).toHaveBeenCalledWith('task', 'org');
  });
  it('asks for the acting IT Admin without a transaction or locks', async () => {
    const h = reading();
    await expect(h.service.list(reader, 'task')).resolves.toEqual([]);
    expect(h.frame.requireActingItAdmin).toHaveBeenCalledWith(undefined, reader, {
      beneficiaryEmployeeId: 'emp',
      taskId: 'task',
    });
  });
  it.each([new ProvisioningNotInChargeError(), new EmployeeNotStartedError('emp')])(
    'hides a task on %s',
    async (error) => {
      const h = reading();
      h.frame.requireActingItAdmin.mockRejectedValue(error);
      await expect(h.service.list(reader, 'task')).rejects.toBeInstanceOf(ProvisioningTaskNotFoundError);
      expect(h.catalog.listProvisioningEvidence).not.toHaveBeenCalled();
      await expect(h.service.link(reader, 'task', 'file')).rejects.toBeInstanceOf(ProvisioningTaskNotFoundError);
      expect(h.catalog.issueProvisioningEvidenceLink).not.toHaveBeenCalled();
    },
  );
  it('does not give the previous completing IT Admin an exception on a completed unplaced task', async () => {
    const h = reading();
    h.repo.findInOrganization.mockResolvedValue({
      id: 'task',
      status: 'COMPLETED',
      completedByAppUserId: 'u',
      assignment: { employeeId: 'emp-unplaced' },
    });
    h.frame.requireActingItAdmin.mockRejectedValue(new ProvisioningNotInChargeError());
    await expect(h.service.list(reader, 'task')).rejects.toBeInstanceOf(ProvisioningTaskNotFoundError);
  });
  it('hides a task absent from the organization even from Super Admin', async () => {
    const h = reading();
    h.repo.findInOrganization.mockResolvedValue(null);
    await expect(h.service.list({ ...reader, roles: ['SUPER_ADMIN'] }, 'task')).rejects.toBeInstanceOf(
      ProvisioningTaskNotFoundError,
    );
    expect(h.catalog.listProvisioningEvidence).not.toHaveBeenCalled();
  });
  it('maps a scoped missing file to the stable task file error', async () => {
    const h = reading();
    await expect(h.service.link(reader, 'task', 'other-file')).rejects.toMatchObject({
      name: 'ProvisioningEvidenceFileNotFoundError',
    });
    expect(h.catalog.issueProvisioningEvidenceLink).toHaveBeenCalledWith(reader, {
      provisioningTaskId: 'task',
      documentId: 'other-file',
    });
  });
  it('returns a link only after the task scope check', async () => {
    const h = reading();
    const link = { url: 'https://storage.example/file', expiresAt: new Date('2026-11-28T00:05:00Z') };
    h.catalog.issueProvisioningEvidenceLink.mockResolvedValue(link);
    await expect(h.service.link(reader, 'task', 'file')).resolves.toEqual(link);
    expect(h.frame.requireActingItAdmin.mock.invocationCallOrder[0]).toBeLessThan(
      h.catalog.issueProvisioningEvidenceLink.mock.invocationCallOrder[0],
    );
  });
});

it('maps the missing evidence file to its stable 404 code', () => {
  const mapped = toProvisioningApiException(new ProvisioningEvidenceFileNotFoundError());
  expect(mapped).toBeInstanceOf(ApiException);
  if (!(mapped instanceof ApiException)) throw new Error('Expected an API exception');
  expect(mapped.getStatus()).toBe(404);
  expect(mapped.getResponse()).toMatchObject({ code: 'PROVISIONING_TASK.EVIDENCE_FILE_NOT_FOUND' });
});
