import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { DepartmentSoftwareNotInCatalogError } from '../public/licensing.errors';
import { DepartmentSoftwareProposalService } from './department-software-proposal.service';
import {
  DepartmentSoftwareNotInChargeError,
  DepartmentSoftwareOwnProposalError,
  DepartmentSoftwareProposalNotFoundError,
} from './department-software.errors';
import { toDepartmentSoftwareApiException } from './department-software.http-errors';
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
    assertMayDecideProposal: jest.fn().mockResolvedValue({ bySubstitute: false }),
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

  return { service, repo, view, inTransaction, organizationReads, access, changes, notice, audit, runner };
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

describe('DepartmentSoftwareProposalService: nobody decides the proposal they made (SoD-4, D-122)', () => {
  /** The head who proposed holds the IT Admin role now (a person holds one role, so this is a change of role after the proposal). */
  const proposer = { ...IT_ADMIN, appUserId: 'user-1', employeeId: 'e1' };

  it.each(['accept', 'reject'] as const)(
    'refuses %s to the person who made the proposal and writes, tells and audits nothing',
    async (action) => {
      const { service, repo, runner, notice, audit } = build();

      await expect(
        action === 'accept' ? service.accept(proposer, proposal.id) : service.reject(proposer, proposal.id, 'No'),
      ).rejects.toBeInstanceOf(DepartmentSoftwareOwnProposalError);

      expect(runner.run).not.toHaveBeenCalled();
      expect(repo.decide).not.toHaveBeenCalled();
      expect(notice.decided).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    },
  );

  it.each(['accept', 'reject'] as const)(
    'still answers that the proposal is not found to an IT Admin who is not in charge of its department, the proposer or not (%s)',
    async (action) => {
      const { service, access } = build();
      access.assertMayDecideProposal.mockRejectedValue(new DepartmentSoftwareProposalNotFoundError());

      await expect(
        action === 'accept' ? service.accept(proposer, proposal.id) : service.reject(proposer, proposal.id, 'No'),
      ).rejects.toBeInstanceOf(DepartmentSoftwareProposalNotFoundError);
    },
  );

  it('lets another IT Admin of the department decide it', async () => {
    const { service, repo } = build();

    await service.accept(IT_ADMIN, proposal.id);

    expect(repo.decide).toHaveBeenCalledTimes(1);
  });
});

describe('DepartmentSoftwareProposalService: acting scope and substitute audit', () => {
  it.each(['accept', 'reject'] as const)(
    'refuses %s with 403 DEPARTMENT_SOFTWARE.NOT_IN_CHARGE when in read scope but outside acting scope',
    async (action) => {
      const { service, access, runner, repo, notice, audit } = build();
      access.assertMayDecideProposal.mockRejectedValue(new DepartmentSoftwareNotInChargeError());

      const caught = await (
        action === 'accept' ? service.accept(IT_ADMIN, proposal.id) : service.reject(IT_ADMIN, proposal.id, 'No')
      ).catch((error: unknown) => error);

      expect(caught).toBeInstanceOf(DepartmentSoftwareNotInChargeError);
      const apiEx = toDepartmentSoftwareApiException(caught) as ApiException;
      expect(apiEx.getStatus()).toBe(403);
      expect(apiEx.getResponse()).toMatchObject({ code: 'DEPARTMENT_SOFTWARE.NOT_IN_CHARGE' });
      expect(runner.run).not.toHaveBeenCalled();
      expect(repo.decide).not.toHaveBeenCalled();
      expect(notice.decided).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    },
  );

  it('re-checks acting scope inside tx after locking the department and audits bySubstitute on accept', async () => {
    const { service, access, changes, organizationReads, audit } = build();
    access.assertMayDecideProposal.mockResolvedValue({ bySubstitute: true });

    await service.accept(IT_ADMIN, proposal.id);

    expect(access.assertMayDecideProposal).toHaveBeenNthCalledWith(1, IT_ADMIN, DEPARTMENT);
    expect(access.assertMayDecideProposal).toHaveBeenNthCalledWith(2, IT_ADMIN, DEPARTMENT, TX);
    expect(organizationReads.lockDepartmentShared.mock.invocationCallOrder[0]).toBeLessThan(
      access.assertMayDecideProposal.mock.invocationCallOrder[1],
    );
    expect(changes.ensureEntry).toHaveBeenCalledWith(
      TX,
      IT_ADMIN,
      ORGANIZATION,
      DEPARTMENT,
      { applicationId: APPLICATION, planId: PLAN },
      null,
      { bySubstitute: true },
    );
    expect(audit.record).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        action: 'DEPARTMENT_SOFTWARE.PROPOSAL_ACCEPTED',
        after: {
          state: 'ACCEPTED',
          departmentId: DEPARTMENT,
          applicationId: APPLICATION,
          planId: PLAN,
          bySubstitute: true,
        },
      }),
    );
  });

  it('re-checks acting scope inside tx after locking the department and audits bySubstitute on reject', async () => {
    const { service, access, organizationReads, audit } = build();
    access.assertMayDecideProposal.mockResolvedValue({ bySubstitute: true });

    await service.reject(IT_ADMIN, proposal.id, 'Not needed');

    expect(access.assertMayDecideProposal).toHaveBeenNthCalledWith(2, IT_ADMIN, DEPARTMENT, TX);
    expect(organizationReads.lockDepartmentShared.mock.invocationCallOrder[0]).toBeLessThan(
      access.assertMayDecideProposal.mock.invocationCallOrder[1],
    );
    expect(audit.record).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        action: 'DEPARTMENT_SOFTWARE.PROPOSAL_REJECTED',
        after: {
          state: 'REJECTED',
          departmentId: DEPARTMENT,
          applicationId: APPLICATION,
          planId: PLAN,
          bySubstitute: true,
        },
      }),
    );
  });

  it('omits bySubstitute from decision audit when the in-charge IT Admin decides', async () => {
    const { service, audit } = build();

    await service.reject(IT_ADMIN, proposal.id, 'Not needed');

    const calls = audit.record.mock.calls as [unknown, { after: Record<string, unknown> }][];
    const recorded = calls[0][1];
    expect(recorded.after).toEqual({
      state: 'REJECTED',
      departmentId: DEPARTMENT,
      applicationId: APPLICATION,
      planId: PLAN,
    });
    expect(recorded.after).not.toHaveProperty('bySubstitute');
  });
});
