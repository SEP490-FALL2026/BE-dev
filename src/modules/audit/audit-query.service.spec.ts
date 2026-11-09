import { AuditQueryService } from './audit-query.service';
import type { AuditQueryRepo } from './audit-query.repo';
import type { StoredAuditEvent } from './public/audit.types';

const event = (overrides: Partial<StoredAuditEvent> = {}): StoredAuditEvent => ({
  id: 'a8b6c4d2-1f3e-4a5b-9c7d-0e2f4a6b8c10',
  occurredAt: new Date('2026-10-16T08:30:00.123Z'),
  actorKind: 'USER',
  actorAppUserId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11',
  actorRoles: ['SUPER_ADMIN'],
  action: 'APP_USER.LOCKED',
  resourceType: 'AppUser',
  resourceId: 'b1',
  before: { status: 'ACTIVE' },
  after: { status: 'LOCKED' },
  correlationId: 's1',
  operatorReference: null,
  ...overrides,
});

function serviceWith(page: { items: StoredAuditEvent[]; total: number }) {
  const findPage = jest.fn().mockResolvedValue(page);

  return { service: new AuditQueryService({ findPage } as unknown as AuditQueryRepo), findPage };
}

describe('AuditQueryService.list', () => {
  it('turns a page number and size into skip and take, and hands the filters to the repository', async () => {
    const { service, findPage } = serviceWith({ items: [], total: 0 });
    const occurredFrom = new Date('2026-10-16T00:00:00Z');

    await service.list({ page: 3, pageSize: 10, resourceType: 'AppUser', occurredFrom });

    expect(findPage).toHaveBeenCalledWith({ resourceType: 'AppUser', occurredFrom, skip: 20, take: 10 });
  });

  it('reports the page, the size, the true total and the number of pages', async () => {
    const { service } = serviceWith({ items: [event()], total: 25 });

    const result = await service.list({ page: 2, pageSize: 10 });

    expect(result.pagination).toEqual({ page: 2, pageSize: 10, totalItems: 25, totalPages: 3 });
    expect(result.items).toHaveLength(1);
  });

  it('keeps the true total on a page past the end, with no items', async () => {
    const { service } = serviceWith({ items: [], total: 25 });

    expect((await service.list({ page: 4, pageSize: 10 })).pagination).toEqual({
      page: 4,
      pageSize: 10,
      totalItems: 25,
      totalPages: 3,
    });
  });

  it('has no pages when there is nothing', async () => {
    const { service } = serviceWith({ items: [], total: 0 });

    expect((await service.list({ page: 1, pageSize: 20 })).pagination.totalPages).toBe(0);
  });

  it('gives back every field of a stored event, nulls included, without inventing any', async () => {
    const stored = event({ actorKind: 'SYSTEM', actorAppUserId: null, actorRoles: [], before: null });
    const { service } = serviceWith({ items: [stored], total: 1 });

    expect((await service.list({ page: 1, pageSize: 20 })).items).toEqual([stored]);
  });

  it('lets a repository failure through unchanged for the controller to map', async () => {
    const failure = new Error('Query read timeout');
    const service = new AuditQueryService({
      findPage: jest.fn().mockRejectedValue(failure),
    } as unknown as AuditQueryRepo);

    await expect(service.list({ page: 1, pageSize: 20 })).rejects.toBe(failure);
  });
});
