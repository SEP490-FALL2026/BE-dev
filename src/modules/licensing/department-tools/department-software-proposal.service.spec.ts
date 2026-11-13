import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { DepartmentSoftwareNotInCatalogError } from '../public/licensing.errors';
import { DepartmentSoftwareProposalService } from './department-software-proposal.service';
import type { SoftwareEntry, SoftwareProposal } from './department-software.types';

const TX = { marker: 'tx' } as unknown as DbTx;
const ORGANIZATION = 'org-1';
const DEPARTMENT = 'dep-1';
const APPLICATION = 'app-1';
const PLAN = 'plan-1';
const HEAD = {
  subject: 'u1',
  appUserId: 'user-1',
  sessionId: 's1',
  employeeId: 'e1',
  directRoles: ['MANAGER'],
  roles: ['MANAGER'],
} satisfies AuthenticatedPrincipal;
const IT_ADMIN = { ...HEAD, appUserId: 'user-2', employeeId: 'e2', directRoles: ['IT_ADMIN'], roles: ['IT_ADMIN'] };

const proposal: SoftwareProposal = {
  id: 'proposal-1',
  organizationId: ORGANIZATION,
  departmentId: DEPARTMENT,
  applicationId: APPLICATION,
  planId: PLAN,
  reason: 'The team needs it',
  state: 'PENDING',
  proposedByEmployeeId: 'e1',
  proposedAt: new Date('2026-11-13T00:00:00Z'),
  decidedAt: null,
  decisionReason: null,
};
const entry: SoftwareEntry = {
  id: 'entry-1',
  organizationId: ORGANIZATION,
  departmentId: DEPARTMENT,
  applicationId: APPLICATION,
  planId: PLAN,
  note: null,
  addedAt: new Date('2026-11-13T00:00:00Z'),
};

/** The service with every neighbour faked; `inTransaction` says, for each read of the catalog, whether it happened inside the runner. */
function build() {
  let inside = false;
  const inTransaction: boolean[] = [];
  const runner = {
    run: jest.fn(async <T>(work: (tx: DbTx) => Promise<T>): Promise<T> => {
      inside = true;
      try {
        return await work(TX);
      } finally {
        inside = false;
      }
    }),
  };
  const repo = {
    findProposal: jest.fn().mockResolvedValue(proposal),
    findEntryByPlace: jest.fn().mockResolvedValue(null),
    insertProposal: jest.fn().mockResolvedValue(proposal),
    decide: jest.fn().mockResolvedValue(true),
  };
  const access = {
    headedDepartment: jest.fn().mockResolvedValue(DEPARTMENT),
    itAdminScope: jest.fn().mockResolvedValue(new Set([DEPARTMENT])),
  };
  const changes = { ensureEntry: jest.fn().mockResolvedValue({ entry, created: true }) };
  const view = {
    assertInCatalog: jest.fn((): Promise<void> => {
      inTransaction.push(inside);

      return Promise.resolve();
    }),
    proposals: jest.fn().mockResolvedValue([{ proposalId: proposal.id }]),
  };
  const notice = { proposed: jest.fn().mockResolvedValue(undefined), decided: jest.fn().mockResolvedValue(undefined) };
  const organizationReads = {
    getOrganization: jest.fn().mockResolvedValue({ id: ORGANIZATION }),
    lockDepartmentShared: jest.fn().mockResolvedValue({ id: DEPARTMENT }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  repo.findProposal.mockImplementation((_id: string, tx?: DbTx) =>
    Promise.resolve(tx ? { ...proposal, state: 'ACCEPTED' } : proposal),
  );
  const service = new DepartmentSoftwareProposalService(
    runner as never,
    repo as never,
    access as never,
    changes as never,
    view as never,
    notice as never,
    organizationReads as never,
    audit as never,
  );

  return { service, repo, view, inTransaction, organizationReads };
}

describe('DepartmentSoftwareProposalService: the catalog is read in the transaction that writes (DS-R3)', () => {
  it('judges a proposal against the catalog inside its transaction, with the transaction, after the department is held', async () => {
    const { service, view, inTransaction, organizationReads } = build();

    await service.propose(HEAD, { applicationId: APPLICATION, planId: PLAN, reason: 'The team needs it' });

    expect(view.assertInCatalog).toHaveBeenCalledWith([{ applicationId: APPLICATION, planId: PLAN }], TX);
    expect(inTransaction).toEqual([true]);
    expect(organizationReads.lockDepartmentShared.mock.invocationCallOrder[0]).toBeLessThan(
      view.assertInCatalog.mock.invocationCallOrder[0],
    );
  });

  it('writes no proposal when the place is not in the catalog', async () => {
    const { service, view, repo } = build();
    view.assertInCatalog.mockRejectedValue(
      new DepartmentSoftwareNotInCatalogError([{ applicationId: APPLICATION, planId: PLAN }]),
    );

    await expect(
      service.propose(HEAD, { applicationId: APPLICATION, planId: PLAN, reason: 'The team needs it' }),
    ).rejects.toBeInstanceOf(DepartmentSoftwareNotInCatalogError);

    expect(repo.insertProposal).not.toHaveBeenCalled();
  });

  it('judges an acceptance against the catalog inside its transaction, before the proposal is decided', async () => {
    const { service, view, inTransaction, repo } = build();

    await service.accept(IT_ADMIN, proposal.id);

    expect(view.assertInCatalog).toHaveBeenCalledWith([{ applicationId: APPLICATION, planId: PLAN }], TX);
    expect(inTransaction).toEqual([true]);
    expect(view.assertInCatalog.mock.invocationCallOrder[0]).toBeLessThan(repo.decide.mock.invocationCallOrder[0]);
  });

  it('leaves the proposal open when the catalog no longer offers the place', async () => {
    const { service, view, repo } = build();
    view.assertInCatalog.mockRejectedValue(
      new DepartmentSoftwareNotInCatalogError([{ applicationId: APPLICATION, planId: PLAN }]),
    );

    await expect(service.accept(IT_ADMIN, proposal.id)).rejects.toBeInstanceOf(DepartmentSoftwareNotInCatalogError);

    expect(repo.decide).not.toHaveBeenCalled();
  });
});
