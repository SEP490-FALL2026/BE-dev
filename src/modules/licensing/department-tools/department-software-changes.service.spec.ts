import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  DepartmentSoftwareNoteInvalidError,
  DepartmentSoftwareNotInCatalogError,
  ToolsDepartmentNotFoundError,
} from '../public/licensing.errors';
import { DepartmentSoftwareChangesService } from './department-software-changes.service';
import type { SoftwareEntry } from './department-software.types';

const TX = {} as DbTx;
const ORGANIZATION = 'org-1';
const DEPARTMENT = 'dep-1';
const APPLICATION = 'app-1';
const PLAN = 'plan-1';
const IT_ADMIN = {
  subject: 'u1',
  appUserId: 'user-1',
  sessionId: 's1',
  employeeId: 'e1',
  directRoles: ['IT_ADMIN'],
  roles: ['IT_ADMIN'],
} satisfies AuthenticatedPrincipal;

const entry = (id: string, planId: string | null = PLAN): SoftwareEntry => ({
  id,
  organizationId: ORGANIZATION,
  departmentId: DEPARTMENT,
  applicationId: APPLICATION,
  planId,
  note: null,
  addedAt: new Date('2026-11-13T00:00:00Z'),
});

function build() {
  const repo = { insertEntries: jest.fn(), findEntryByPlace: jest.fn() };
  const view = { assertInCatalog: jest.fn().mockResolvedValue(undefined) };
  const organizationReads = {
    getOrganization: jest.fn().mockResolvedValue({ id: ORGANIZATION }),
    lockDepartmentShared: jest.fn().mockResolvedValue({ id: DEPARTMENT }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new DepartmentSoftwareChangesService(
    {} as never,
    repo as never,
    {} as never,
    view as never,
    organizationReads as never,
    audit as never,
  );

  return { service, repo, view, organizationReads, audit };
}

const input = { departmentId: DEPARTMENT, applicationId: APPLICATION, planId: PLAN, note: null };

describe('DepartmentSoftwareChangesService.addFromCatalogLink (the tick "add to the list of the department" of the link to the catalog, IN-1)', () => {
  it('writes the place in the transaction of the caller, audits it once and says it was added', async () => {
    const { service, repo, audit } = build();
    repo.insertEntries.mockResolvedValue([entry('entry-1')]);

    const result = await service.addFromCatalogLink(TX, IT_ADMIN, input);

    expect(result).toEqual({ entryId: 'entry-1', added: true });
    expect(repo.insertEntries).toHaveBeenCalledWith(TX, {
      organizationId: ORGANIZATION,
      departmentId: DEPARTMENT,
      addedByAppUserId: 'user-1',
      items: [{ applicationId: APPLICATION, planId: PLAN, note: null }],
    });
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        action: 'DEPARTMENT_SOFTWARE.ENTRY_ADDED',
        resourceType: 'DepartmentSoftwareEntry',
        resourceId: 'entry-1',
      }),
    );
  });

  it('keeps the note the IT Admin gave', async () => {
    const { service, repo } = build();
    repo.insertEntries.mockResolvedValue([entry('entry-1')]);

    await service.addFromCatalogLink(TX, IT_ADMIN, { ...input, note: 'linked from a request' });

    expect(repo.insertEntries).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ items: [{ applicationId: APPLICATION, planId: PLAN, note: 'linked from a request' }] }),
    );
  });

  it('trims the note, and keeps no note when nothing is left of it (DS-R2)', async () => {
    const { service, repo } = build();
    repo.insertEntries.mockResolvedValue([entry('entry-1')]);

    await service.addFromCatalogLink(TX, IT_ADMIN, { ...input, note: '  linked from a request  ' });
    await service.addFromCatalogLink(TX, IT_ADMIN, { ...input, note: '   ' });

    expect(repo.insertEntries).toHaveBeenNthCalledWith(
      1,
      TX,
      expect.objectContaining({ items: [{ applicationId: APPLICATION, planId: PLAN, note: 'linked from a request' }] }),
    );
    expect(repo.insertEntries).toHaveBeenNthCalledWith(
      2,
      TX,
      expect.objectContaining({ items: [{ applicationId: APPLICATION, planId: PLAN, note: null }] }),
    );
  });

  it.each([
    ['one over the limit', 'x'.repeat(501), 'TOO_LONG'],
    ['a NUL no text column keeps', 'a\u0000b', 'ILLEGAL_CHARACTER'],
  ])(
    'refuses a note with %s before any statement, so the transaction of the caller stays alive (DS-R2)',
    async (_name, note, reason) => {
      const { service, repo, view, organizationReads } = build();

      const refused = await service
        .addFromCatalogLink(TX, IT_ADMIN, { ...input, note })
        .catch((error: unknown) => error);

      expect(refused).toBeInstanceOf(DepartmentSoftwareNoteInvalidError);
      expect((refused as DepartmentSoftwareNoteInvalidError).reason).toBe(reason);
      expect(repo.insertEntries).not.toHaveBeenCalled();
      expect(view.assertInCatalog).not.toHaveBeenCalled();
      expect(organizationReads.lockDepartmentShared).not.toHaveBeenCalled();
    },
  );

  it('answers the entry that is there when the place is listed already, and writes and audits nothing more', async () => {
    const { service, repo, audit } = build();
    repo.insertEntries.mockResolvedValue([]);
    repo.findEntryByPlace.mockResolvedValue(entry('entry-9'));

    const result = await service.addFromCatalogLink(TX, IT_ADMIN, input);

    expect(result).toEqual({ entryId: 'entry-9', added: false });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('writes the place when the entry it found beside it was taken out meanwhile, once more and no more', async () => {
    const { service, repo } = build();
    repo.insertEntries.mockResolvedValueOnce([]).mockResolvedValueOnce([entry('entry-2')]);
    repo.findEntryByPlace.mockResolvedValueOnce(null);

    const result = await service.addFromCatalogLink(TX, IT_ADMIN, input);

    expect(result).toEqual({ entryId: 'entry-2', added: true });
    expect(repo.insertEntries).toHaveBeenCalledTimes(2);
  });

  it('gives up with an error, not a silent answer, when the place can be neither written nor found twice', async () => {
    const { service, repo } = build();
    repo.insertEntries.mockResolvedValue([]);
    repo.findEntryByPlace.mockResolvedValue(null);

    await expect(service.addFromCatalogLink(TX, IT_ADMIN, input)).rejects.toThrow('neither written nor found');
  });

  it('refuses what the catalog does not offer and writes nothing', async () => {
    const { service, repo, view } = build();
    view.assertInCatalog.mockRejectedValue(
      new DepartmentSoftwareNotInCatalogError([{ applicationId: APPLICATION, planId: PLAN }]),
    );

    await expect(service.addFromCatalogLink(TX, IT_ADMIN, input)).rejects.toBeInstanceOf(
      DepartmentSoftwareNotInCatalogError,
    );

    expect(view.assertInCatalog).toHaveBeenCalledWith([{ applicationId: APPLICATION, planId: PLAN }], TX);
    expect(repo.insertEntries).not.toHaveBeenCalled();
  });

  it('refuses a department that does not exist', async () => {
    const { service, repo, organizationReads } = build();
    organizationReads.lockDepartmentShared.mockResolvedValue(null);

    await expect(service.addFromCatalogLink(TX, IT_ADMIN, input)).rejects.toBeInstanceOf(ToolsDepartmentNotFoundError);

    expect(repo.insertEntries).not.toHaveBeenCalled();
    expect(organizationReads.lockDepartmentShared).toHaveBeenCalledWith(TX, DEPARTMENT);
  });
});

describe('DepartmentSoftwareChangesService.change: the catalog is read in the transaction that writes (DS-R3)', () => {
  function buildChange() {
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
      insertEntries: jest.fn().mockResolvedValue([entry('entry-1')]),
      findEntries: jest.fn().mockResolvedValue([]),
      deleteEntries: jest.fn().mockResolvedValue(0),
    };
    const access = { assertMayChange: jest.fn().mockResolvedValue(undefined) };
    const view = {
      assertInCatalog: jest.fn((): Promise<void> => {
        inTransaction.push(inside);

        return Promise.resolve();
      }),
      entries: jest.fn().mockResolvedValue([]),
    };
    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue({ id: ORGANIZATION }),
      lockDepartmentShared: jest.fn().mockResolvedValue({ id: DEPARTMENT }),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new DepartmentSoftwareChangesService(
      runner as never,
      repo as never,
      access as never,
      view as never,
      organizationReads as never,
      audit as never,
    );

    return { service, repo, view, inTransaction, organizationReads };
  }
  const add = [{ applicationId: APPLICATION, planId: PLAN, note: null }];

  it('judges the places to add inside the transaction, with the transaction, after the department is held', async () => {
    const { service, view, inTransaction, organizationReads } = buildChange();

    await service.change(IT_ADMIN, DEPARTMENT, { add, remove: [] });

    expect(view.assertInCatalog).toHaveBeenCalledWith(add, TX);
    expect(inTransaction).toEqual([true]);
    expect(organizationReads.lockDepartmentShared.mock.invocationCallOrder[0]).toBeLessThan(
      view.assertInCatalog.mock.invocationCallOrder[0],
    );
  });

  it('writes nothing when a place is not in the catalog', async () => {
    const { service, view, repo } = buildChange();
    view.assertInCatalog.mockRejectedValue(
      new DepartmentSoftwareNotInCatalogError([{ applicationId: APPLICATION, planId: PLAN }]),
    );

    await expect(service.change(IT_ADMIN, DEPARTMENT, { add, remove: [] })).rejects.toBeInstanceOf(
      DepartmentSoftwareNotInCatalogError,
    );

    expect(repo.insertEntries).not.toHaveBeenCalled();
    expect(repo.deleteEntries).not.toHaveBeenCalled();
  });
});
