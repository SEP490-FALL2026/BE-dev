import { DocumentRepo } from './document.repo';

describe('provisioning evidence document persistence', () => {
  it('reads only a bounded READY projection of the task in deterministic order', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'a',
        purpose: 'PROVISIONING_EVIDENCE',
        fileName: 'a.pdf',
        contentType: 'application/pdf',
        sizeBytes: 20,
        attachedAt: new Date('2026-11-28T00:00:00Z'),
      },
    ]);
    const repo = new DocumentRepo({ documentAttachment: { findMany } } as never);
    const result = await repo.listReadyOfProvisioningTask('task');
    expect(result).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        provisioningTaskId: 'task',
        status: 'READY',
        purpose: { in: ['PROVISIONING_EVIDENCE', 'ACCESS_CUT_EVIDENCE'] },
      },
      select: { id: true, purpose: true, fileName: true, contentType: true, sizeBytes: true, attachedAt: true },
      orderBy: [{ attachedAt: 'asc' }, { id: 'asc' }],
      take: 6,
    });
  });
  it('requires file id, task id, READY and an evidence purpose when opening a file', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const repo = new DocumentRepo({ documentAttachment: { findFirst } } as never);
    await expect(repo.findReadyOfProvisioningTask('task', 'file')).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'file',
        provisioningTaskId: 'task',
        status: 'READY',
        purpose: { in: ['PROVISIONING_EVIDENCE', 'ACCESS_CUT_EVIDENCE'] },
      },
    });
  });
  it('writes the task owner and attachment time in the supplied transaction', async () => {
    const update = jest.fn();
    const tx = { documentAttachment: { update } } as never;
    const repo = new DocumentRepo({} as never);
    const now = new Date('2026-11-28T00:00:00Z');
    await repo.markAttachedToProvisioningTask(tx, 'file', 'task', now);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'file' },
      data: { status: 'READY', provisioningTaskId: 'task', attachedAt: now },
    });
  });
});
