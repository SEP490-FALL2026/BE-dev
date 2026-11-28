import { DocumentAttachRefusedError } from '../../../catalog/public/catalog.errors';
import { ProvisioningEvidenceFilesService } from './provisioning-evidence-files.service';

const actor = { appUserId: 'u' } as never;
const tx = {} as never;
describe('attach evidence through the public catalog facade', () => {
  it.each([undefined, []])('does not call catalog for %j', async (ids) => {
    const attachProvisioningEvidence = jest.fn();
    const service = new ProvisioningEvidenceFilesService({ attachProvisioningEvidence } as never);
    await expect(service.attach(tx, actor, 'task', ids, 'PROVISIONING_EVIDENCE')).resolves.toEqual([]);
    expect(attachProvisioningEvidence).not.toHaveBeenCalled();
  });
  it('sorts ids and forwards the same transaction, actor, task and purpose', async () => {
    const attachProvisioningEvidence = jest.fn();
    const service = new ProvisioningEvidenceFilesService({ attachProvisioningEvidence } as never);
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
      const service = new ProvisioningEvidenceFilesService({
        attachProvisioningEvidence: () => Promise.reject(new DocumentAttachRefusedError(problem)),
      } as never);
      await expect(service.attach(tx, actor, 'task', ['a'], 'PROVISIONING_EVIDENCE')).rejects.toMatchObject({
        name: 'ProvisioningEvidenceFileInvalidError',
        problem,
      });
    },
  );
});
