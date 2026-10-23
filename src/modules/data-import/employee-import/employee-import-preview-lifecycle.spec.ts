import {
  ACTOR,
  FAKE_CLOCK,
  FILE,
  NOW,
  confirmBody,
  harness,
  upload,
} from '../../../../test/support/employee-import-service-harness';
import { ImportNotFoundError, ImportStateError } from './employee-import.errors';
import type { ImportRecord } from './employee-import.repo';
import { PREVIEW_TTL_MS } from './employee-import.service';

/* What happens to a preview after the upload, short of writing it: view, rows, refresh, cancel, and the latest kept
 * import the onboarding checklist reads. */

describe('EmployeeImportService: view, rows, refresh, cancel and latest import (H8 Phase 0 characterization)', () => {
  beforeEach(() => {
    jest.useFakeTimers(FAKE_CLOCK);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('view and rows', () => {
    it('is not found for an import that does not exist', async () => {
      const h = harness();

      await expect(h.service.view('nope')).rejects.toBeInstanceOf(ImportNotFoundError);
      await expect(h.service.rows('nope', { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(ImportNotFoundError);
      expect(h.calls).toEqual(['repo.find()', 'repo.find()']);
    });

    it('pages the rows in file order, filtered by outcome only when one is asked for', async () => {
      const h = harness();
      const { id } = await upload(h, FILE);
      h.reset();

      const last = await h.service.rows(id, { page: 3, pageSize: 2 });
      const errors = await h.service.rows(id, { outcome: 'ERROR', page: 1, pageSize: 20 });
      const beyond = await h.service.rows(id, { page: 9, pageSize: 2 });

      expect(last).toEqual({
        items: [expect.objectContaining({ lineNumber: 6, outcome: 'ERROR' })],
        pagination: { page: 3, pageSize: 2, totalItems: 5, totalPages: 3 },
      });
      expect(errors.items.map((row) => row.lineNumber)).toEqual([6]);
      expect(errors.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });
      expect(beyond).toEqual({ items: [], pagination: { page: 9, pageSize: 2, totalItems: 5, totalPages: 3 } });
      expect(Object.keys(last)).toEqual(['items', 'pagination']);
      expect(Object.keys(last.pagination)).toEqual(['page', 'pageSize', 'totalItems', 'totalPages']);
      expect(h.calls).toEqual([
        'repo.find()',
        'repo.page({"skip":4,"take":2})',
        'repo.find()',
        'repo.page({"outcome":"ERROR","skip":0,"take":20})',
        'repo.find()',
        'repo.page({"skip":16,"take":2})',
      ]);
    });
  });

  describe('refresh', () => {
    it('judges the stored rows again under the lock, as a higher version, without an audit record', async () => {
      const h = harness();
      const { id } = await upload(h, FILE);
      h.reset();
      jest.setSystemTime(new Date(NOW.getTime() + 60_000));
      h.dir.departments[1].active = false;

      const view = await h.service.refresh(ACTOR, id);

      expect(h.calls).toEqual([
        'org.getOrganization',
        'repo.find()',
        'repo.rows()',
        'org.getEmployee()',
        'org.lookupForEmployeeImport()',
        'repo.findCompletedWithContent()',
        'org.lookupForEmployeeImport()',
        'org.departmentsWithoutHead(d-ops)',
        'BEGIN',
        'repo.lock(tx)',
        'repo.replacePreview(tx)',
        'COMMIT',
        'repo.find()',
      ]);
      expect(view.previewVersion).toBe(2);
      expect(view.expiresAt).toEqual(new Date(NOW.getTime() + 60_000 + PREVIEW_TTL_MS));
      expect(view.summary).toMatchObject({ valid: 1, errors: 2, newPeopleByDepartment: [{ departmentCode: 'P-OPS' }] });
      expect(h.storedRows.get(id)?.[1]).toMatchObject({
        lineNumber: 3,
        outcome: 'ERROR',
        errors: [{ column: 'department_code', code: 'DEPARTMENT_INACTIVE' }],
      });
      expect(h.audits).toEqual([]);
    });

    it.each<[string, 'CANCELLED' | 'COMPLETED', string]>([
      ['cancelled', 'CANCELLED', 'CANCELLED'],
      ['written', 'COMPLETED', 'NOT_PREVIEW'],
    ])('refuses an import that is %s, before reading its rows', async (_name, status, problem) => {
      const h = harness();
      const { id } = await upload(h, FILE);
      (h.imports.get(id) as ImportRecord).status = status;
      h.reset();

      const error = await h.service.refresh(ACTOR, id).catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(ImportStateError);
      expect(error).toMatchObject({ problem });
      expect(h.calls).toEqual(['org.getOrganization', 'repo.find()']);
    });

    it('refuses when the import stopped being a preview between the read and the lock, and replaces nothing', async () => {
      const h = harness();
      const { id } = await upload(h, FILE);
      h.reset();
      h.onLock((record) => {
        record.status = 'CANCELLED';
      });

      await expect(h.service.refresh(ACTOR, id)).rejects.toMatchObject({ problem: 'CANCELLED' });
      expect(h.calls.slice(-3)).toEqual(['BEGIN', 'repo.lock(tx)', 'ROLLBACK']);
    });

    it('is not found when there is no such import', async () => {
      const h = harness();

      await expect(h.service.refresh(ACTOR, 'nope')).rejects.toBeInstanceOf(ImportNotFoundError);
    });
  });

  describe('cancel', () => {
    it('marks the preview cancelled under the lock and records it', async () => {
      const h = harness();
      const { id } = await upload(h, FILE);
      h.reset();

      const view = await h.service.cancel(ACTOR, id);

      expect(h.calls).toEqual([
        'org.getOrganization',
        'BEGIN',
        'repo.lock(tx)',
        `repo.markCancelled(tx, ${NOW.toISOString()})`,
        'audit.record(tx)',
        'COMMIT',
        'repo.find()',
      ]);
      expect(view).toMatchObject({ status: 'CANCELLED', cancelledAt: NOW });
      expect(h.audits).toEqual([
        {
          organizationId: 'org-1',
          actorKind: 'USER',
          actorAppUserId: 'u-sa',
          actorRoles: ['SUPER_ADMIN'],
          action: 'EMPLOYEE_IMPORT.CANCELLED',
          resourceType: 'EmployeeImport',
          resourceId: id,
          before: { status: 'PREVIEW' },
          after: { status: 'CANCELLED' },
          correlationId: 'session-1',
        },
      ]);
    });

    it('does nothing the second time, and records nothing', async () => {
      const h = harness();
      const { id } = await upload(h, FILE);
      await h.service.cancel(ACTOR, id);
      h.reset();

      const view = await h.service.cancel(ACTOR, id);

      expect(view.status).toBe('CANCELLED');
      expect(h.calls).toEqual(['org.getOrganization', 'BEGIN', 'repo.lock(tx)', 'COMMIT', 'repo.find()']);
      expect(h.audits).toEqual([]);
    });

    it('refuses an import already written, and one that does not exist', async () => {
      const h = harness();
      const { id } = await upload(h, FILE);
      await h.service.confirm(ACTOR, id, confirmBody());

      await expect(h.service.cancel(ACTOR, id)).rejects.toMatchObject({
        constructor: ImportStateError,
        problem: 'NOT_PREVIEW',
      });
      h.reset();
      await expect(h.service.cancel(ACTOR, 'nope')).rejects.toBeInstanceOf(ImportNotFoundError);
      expect(h.calls).toEqual(['org.getOrganization', 'BEGIN', 'repo.lock(tx)', 'ROLLBACK']);
    });
  });

  describe('latest import for the onboarding checklist', () => {
    it('reads the latest kept import of the organization', async () => {
      const h = harness();

      await expect(h.service.latestImport()).resolves.toEqual({
        id: 'import-9',
        status: 'PREVIEW',
        errorRows: 3,
        createdAt: NOW,
      });
      expect(h.calls).toEqual(['org.getOrganization', 'repo.findLatestKept(org-1)']);
    });
  });
});
