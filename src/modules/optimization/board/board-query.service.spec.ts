import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BoardQueryService } from './board-query.service';

const ORG = { id: 'org-1' };
const itAdmin = { employeeId: 'it-1', roles: ['IT_ADMIN'] } as unknown as AuthenticatedPrincipal;
const head = { employeeId: 'head-1', roles: ['MANAGER'] } as unknown as AuthenticatedPrincipal;

const RECORD = {
  id: 'rec-1',
  organizationId: ORG.id,
  group: 'G2',
  state: 'OPEN',
  closeReason: null,
  tier: null,
  applicationId: 'app-1',
  planId: 'plan-1',
  subscriptionId: null,
  assignmentId: null,
  employeeId: 'emp-1',
  freeSeats: null,
  countsTowardVacantCost: null,
  revocationTaskId: null,
  holderLeftOn: null,
  createdAt: new Date('2026-11-01T00:00:00Z'),
  evidence: { group: 'G2', terminatingAccess: null },
};
const SEAT_STATE = {
  seatChainId: 'chain-1',
  organizationId: ORG.id,
  applicationId: 'app-1',
  assignmentId: 'asg-1',
  employeeId: 'emp-1',
  status: 'ACTIVE',
  lastActiveDate: '2026-11-01',
  inactiveDays: 3,
  gate: null,
  assessedRunId: 'run-1',
  assessedOn: '2026-11-02',
};

function build(overrides: { itScope?: string[]; headed?: string | null; members?: Record<string, string[]> } = {}) {
  const repo = {
    page: jest
      .fn<Promise<unknown>, [string, Record<string, unknown>, unknown]>()
      .mockResolvedValue({ items: [RECORD], total: 1 }),
  };
  const seatStates = {
    seatStatePage: jest
      .fn<Promise<unknown>, [string, { employeeIds?: string[] }, unknown]>()
      .mockResolvedValue({ items: [SEAT_STATE], total: 1 }),
  };
  const organizationReads = {
    getOrganization: jest.fn().mockResolvedValue(ORG),
    getItAdminScope: jest
      .fn<Promise<string[]>, [string, (ids: string[]) => Promise<Set<string>>]>()
      .mockResolvedValue(overrides.itScope ?? ['d-it']),
    getHeadedDepartment: jest
      .fn()
      .mockResolvedValue(overrides.headed === null ? null : { departmentId: overrides.headed ?? 'd-head' }),
    getDepartmentMemberIds: jest.fn((id: string) => Promise.resolve((overrides.members ?? {})[id] ?? [])),
    getEmployees: jest.fn().mockResolvedValue([{ id: 'emp-1', employeeCode: 'E1', fullName: 'Nguyen Van A' }]),
    getDepartmentIdsInChargeOf: jest.fn().mockResolvedValue(['must-not-be-used']),
  };
  const catalog = {
    getPlanSummaries: jest.fn().mockResolvedValue([{ planId: 'plan-1', planName: 'Pro', applicationName: 'Jira' }]),
    getCollectorApplications: jest.fn().mockResolvedValue([{ id: 'app-1', name: 'Jira' }]),
  };
  const identity = { findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(['it-1'])) };
  const service = new BoardQueryService(
    repo as never,
    seatStates as never,
    {} as never,
    organizationReads as never,
    catalog as never,
    identity as never,
  );

  return { service, repo, seatStates, organizationReads, identity };
}

const page = { page: 1, pageSize: 20 };

describe('QĐ-111aw: the table of wasted seats shows a holder by code, never by name', () => {
  it('has no fullName on any row of the recommendations or of the seat states', async () => {
    const { service } = build({ members: {} });

    const recommendations = await service.list(itAdmin, { departmentScope: 'ALL', ...page });
    const states = await service.listSeatStates(itAdmin, { departmentScope: 'ALL', ...page });

    expect(recommendations.items[0]?.holder).toEqual({ employeeId: 'emp-1', employeeCode: 'E1' });
    expect(states.items[0]?.holder).toEqual({ employeeId: 'emp-1', employeeCode: 'E1' });
    expect(JSON.stringify([recommendations, states])).not.toContain('fullName');
    expect(JSON.stringify([recommendations, states])).not.toContain('Nguyen Van A');
  });
});

describe('R-20, m-14: MINE is the scope of the reader', () => {
  it('is, for an IT Admin, the departments of getItAdminScope (a department with no usable IT Admin included), not the ones in charge', async () => {
    const { service, repo, organizationReads, identity } = build({ itScope: ['d-it', 'd-no-it'] });

    await service.list(itAdmin, { departmentScope: 'MINE', ...page });

    expect(repo.page).toHaveBeenCalledWith(
      ORG.id,
      expect.objectContaining({ departmentIds: ['d-it', 'd-no-it'] }),
      expect.anything(),
    );
    expect(organizationReads.getDepartmentIdsInChargeOf).not.toHaveBeenCalled();
    const usable = organizationReads.getItAdminScope.mock.calls[0]?.[1];
    await expect(usable(['it-1'])).resolves.toEqual(new Set(['it-1']));
    expect(identity.findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-1']);
  });

  it('is, for a head, only the department they head', async () => {
    const { service, repo, organizationReads } = build({ headed: 'd-head' });

    await service.list(head, { departmentScope: 'MINE', ...page });

    expect(repo.page).toHaveBeenCalledWith(
      ORG.id,
      expect.objectContaining({ departmentIds: ['d-head'] }),
      expect.anything(),
    );
    expect(organizationReads.getItAdminScope).not.toHaveBeenCalled();
  });

  it('is nothing for a person who heads no department, and the whole organization is read for ALL', async () => {
    const { service, repo } = build({ headed: null });

    await service.list(head, { departmentScope: 'MINE', ...page });
    await service.list(head, { departmentScope: 'ALL', ...page });

    expect(repo.page.mock.calls[0]?.[1]).toEqual({ departmentIds: [] });
    expect(repo.page.mock.calls[1]?.[1]).toEqual({});
  });
});

describe('QĐ-111aw: a filter on a department or a holder stays inside the scope, and outside it reads an empty page', () => {
  it('reads one department of the scope exactly, and an empty page for another one, with no read of the table', async () => {
    const { service, repo } = build({ itScope: ['d-it'] });

    await service.list(itAdmin, { departmentScope: 'MINE', departmentId: 'd-it', ...page });
    const outside = await service.list(itAdmin, { departmentScope: 'MINE', departmentId: 'd-other', ...page });

    expect(repo.page).toHaveBeenCalledTimes(1);
    expect(repo.page.mock.calls[0]?.[1]).toEqual({ departmentId: 'd-it' });
    expect(outside).toEqual({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
  });

  it('passes the holder filter next to the scope, so a holder outside the scope is never read', async () => {
    const { service, repo } = build({ itScope: ['d-it'] });

    await service.list(itAdmin, { departmentScope: 'MINE', employeeId: 'emp-9', ...page });

    expect(repo.page.mock.calls[0]?.[1]).toEqual({ employeeId: 'emp-9', departmentIds: ['d-it'] });
  });

  it('limits the seat states to the holders placed in the scope; a department or a holder outside it reads an empty page', async () => {
    const { service, seatStates } = build({
      itScope: ['d-it', 'd-2'],
      members: { 'd-it': ['emp-1', 'emp-2'], 'd-2': ['emp-3'] },
    });

    await service.listSeatStates(itAdmin, { departmentScope: 'MINE', ...page });
    await service.listSeatStates(itAdmin, { departmentScope: 'MINE', departmentId: 'd-2', ...page });
    await service.listSeatStates(itAdmin, { departmentScope: 'MINE', employeeId: 'emp-2', ...page });
    const otherDepartment = await service.listSeatStates(itAdmin, {
      departmentScope: 'MINE',
      departmentId: 'd-x',
      ...page,
    });
    const otherHolder = await service.listSeatStates(itAdmin, {
      departmentScope: 'MINE',
      employeeId: 'emp-9',
      ...page,
    });

    expect(
      seatStates.seatStatePage.mock.calls.map((call: unknown[]) => (call[1] as { employeeIds?: string[] }).employeeIds),
    ).toEqual([['emp-1', 'emp-2', 'emp-3'], ['emp-3'], ['emp-2']]);
    expect(otherDepartment.items).toEqual([]);
    expect(otherHolder.items).toEqual([]);
  });

  it('reads every seat state for ALL, and an empty page when the scope has nobody', async () => {
    const { service, seatStates } = build({ itScope: ['d-it'], members: { 'd-it': [] } });

    await service.listSeatStates(itAdmin, { departmentScope: 'ALL', ...page });
    const none = await service.listSeatStates(itAdmin, { departmentScope: 'MINE', ...page });

    expect(seatStates.seatStatePage).toHaveBeenCalledTimes(1);
    expect(seatStates.seatStatePage.mock.calls[0]?.[1]).not.toHaveProperty('employeeIds');
    expect(none.items).toEqual([]);
  });
});
