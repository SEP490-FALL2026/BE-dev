import {
  ACTOR,
  FAKE_CLOCK,
  FILE,
  HR_BASIS,
  NOW,
  TODAY,
  confirmBody,
  harness,
  upload,
} from '../../../../test/support/employee-import-service-harness';
import { EmployeeCodeTakenError, EmployeeEmailTakenError } from '../../organization/organization.errors';
import {
  ImportAlreadyConfirmedError,
  ImportDuplicateFileError,
  ImportNotFoundError,
  ImportPreviewOutdatedError,
  ImportPreviewStaleError,
  ImportStateError,
} from './employee-import.errors';
import type { ImportRecord, StoredRow } from './employee-import.repo';

/* Confirmation of a preview: lock, judge again under locks, write the valid rows once, record it; and every refusal,
 * replay and stale case, each of which writes nothing. */

describe('EmployeeImportService: confirm (H8 Phase 0 characterization)', () => {
  beforeEach(() => {
    jest.useFakeTimers(FAKE_CLOCK);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('confirm', () => {
    it('locks, judges again under the locks of what the valid rows use, writes the valid rows, then records it', async () => {
      const h = harness();
      const { id } = await upload(h, FILE);
      h.reset();

      const answer = await h.service.confirm(ACTOR, id, confirmBody());

      expect(h.calls).toEqual([
        'org.getOrganization',
        'BEGIN',
        'repo.lock(tx)',
        'repo.findCompletedWithContent(tx)',
        'org.getEmployee(tx)',
        'repo.rows(tx)',
        'org.lookupForEmployeeImport(tx)',
        'org.lockForEmployeeImport(tx)',
        'org.lookupForEmployeeImport(tx)',
        'org.businessToday',
        'org.createEmployeeWithPlacement(tx, N-1)',
        'audit.record(tx)',
        'org.createEmployeeWithPlacement(tx, N-2)',
        'audit.record(tx)',
        'org.departmentsWithoutHead(d-ops,d-des)',
        'repo.markCompleted(tx)',
        'audit.record(tx)',
        'COMMIT',
        'repo.find()',
      ]);
      expect(h.locks).toEqual([{ departmentIds: ['d-ops', 'd-des'], jobTitleIds: ['j-adm', 'j-des'] }]);
      expect(h.created).toEqual([
        {
          organizationId: 'org-1',
          employeeCode: 'N-1',
          fullName: 'Binh Tran',
          workEmail: 'Binh@Acme.vn',
          employmentType: 'STAFF',
          hireDate: '2026-10-01',
          memberSince: TODAY,
          departmentId: 'd-ops',
          jobTitleId: 'j-adm',
        },
        {
          organizationId: 'org-1',
          employeeCode: 'N-2',
          fullName: 'Chi Le',
          workEmail: null,
          employmentType: 'INTERN',
          hireDate: '2026-10-02',
          memberSince: TODAY,
          departmentId: 'd-des',
          jobTitleId: 'j-des',
        },
      ]);
      const result = {
        created: 2,
        existingSame: 1,
        existingDifferent: 1,
        errors: 1,
        createdByDepartment: [
          { departmentCode: 'P-OPS', count: 1 },
          { departmentCode: 'P-DES', count: 1 },
        ],
        departmentsWithoutHead: [{ code: 'P-DES', name: 'Design' }],
      };
      expect(h.imports.get(id)).toMatchObject({
        status: 'COMPLETED',
        result,
        confirmKey: 'key-00000001',
        confirmedAt: NOW,
      });
      expect(h.audits.slice(0, 2)).toEqual(
        ['N-1', 'N-2'].map((employeeCode, index) => ({
          organizationId: 'org-1',
          actorKind: 'USER',
          actorAppUserId: 'u-sa',
          actorRoles: ['SUPER_ADMIN'],
          action: 'EMPLOYEE.CREATED',
          resourceType: 'Employee',
          resourceId: `new-${employeeCode}`,
          before: null,
          // The code, the department and the title of the file and the HR basis: no name and no email.
          after: {
            employeeCode,
            department: index === 0 ? 'P-OPS' : 'P-DES',
            jobTitle: index === 0 ? 'Administrator' : 'Designer',
            importId: id,
            hrBasis: HR_BASIS,
          },
          correlationId: 'session-1',
        })),
      );
      expect(h.audits.slice(2)).toEqual([
        {
          organizationId: 'org-1',
          actorKind: 'USER',
          actorAppUserId: 'u-sa',
          actorRoles: ['SUPER_ADMIN'],
          action: 'EMPLOYEE_IMPORT.CONFIRMED',
          resourceType: 'EmployeeImport',
          resourceId: id,
          before: { status: 'PREVIEW', previewVersion: 1 },
          after: {
            status: 'COMPLETED',
            created: 2,
            existingSame: 1,
            existingDifferent: 1,
            errors: 1,
            repeatedFile: false,
            hrBasis: HR_BASIS,
          },
          correlationId: 'session-1',
        },
      ]);
      expect(answer).toEqual({
        replayed: false,
        import: expect.objectContaining({ id, status: 'COMPLETED', result, confirmedAt: NOW }) as unknown,
      });
      expect(Object.keys(answer)).toEqual(['import', 'replayed']);
    });

    it('answers the same confirmation again with the first result and writes nothing more', async () => {
      const h = harness();
      const { id } = await upload(h, FILE);
      const first = await h.service.confirm(ACTOR, id, confirmBody());
      h.reset();

      const again = await h.service.confirm(ACTOR, id, confirmBody());

      expect(again).toEqual({ replayed: true, import: first.import });
      expect(h.calls).toEqual(['org.getOrganization', 'BEGIN', 'repo.lock(tx)', 'COMMIT', 'repo.find()']);
    });

    it('refuses another key once written, with the result of the first', async () => {
      const h = harness();
      const { id } = await upload(h, FILE);
      const first = await h.service.confirm(ACTOR, id, confirmBody());

      const error = await h.service
        .confirm(ACTOR, id, confirmBody({ idempotencyKey: 'key-00000002' }))
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(ImportAlreadyConfirmedError);
      expect((error as ImportAlreadyConfirmedError).result).toEqual(first.import.result);
    });

    it.each<[string, (record: ImportRecord) => void, number, (error: unknown) => void]>([
      [
        'cancelled, even with another version',
        (record) => {
          record.status = 'CANCELLED';
        },
        9,
        (e) => expect(e).toMatchObject({ constructor: ImportStateError, problem: 'CANCELLED' }),
      ],
      [
        'expired at exactly now, even with another version',
        (record) => {
          record.expiresAt = new Date(NOW);
        },
        9,
        (e) => expect(e).toMatchObject({ constructor: ImportStateError, problem: 'EXPIRED' }),
      ],
      [
        'not the current version',
        () => undefined,
        2,
        (e) => expect(e).toMatchObject({ constructor: ImportPreviewOutdatedError, currentVersion: 1 }),
      ],
    ])('refuses a preview that is %s, under the lock, and writes nothing', async (_name, change, version, check) => {
      const h = harness();
      const { id } = await upload(h, FILE);
      change(h.imports.get(id) as ImportRecord);
      h.reset();

      check(await h.service.confirm(ACTOR, id, confirmBody({ previewVersion: version })).catch((e: unknown) => e));
      expect(h.calls).toEqual(['org.getOrganization', 'BEGIN', 'repo.lock(tx)', 'ROLLBACK']);
    });

    it('takes a preview that expires one millisecond from now', async () => {
      const h = harness();
      const { id } = await upload(h, FILE);
      (h.imports.get(id) as ImportRecord).expiresAt = new Date(NOW.getTime() + 1);

      await expect(h.service.confirm(ACTOR, id, confirmBody())).resolves.toMatchObject({ replayed: false });
    });

    it('is not found when there is no such import', async () => {
      const h = harness();

      await expect(h.service.confirm(ACTOR, 'nope', confirmBody())).rejects.toBeInstanceOf(ImportNotFoundError);
    });

    it('refuses a file imported before unless acknowledged, then writes it and records the repeat', async () => {
      const h = harness();
      const first = await upload(h, FILE, 'first.csv');
      await h.service.confirm(ACTOR, first.id, confirmBody());
      const second = await upload(h, FILE, 'second.csv');
      expect(second.summary.duplicateOf).toEqual({
        importId: first.id,
        fileName: 'first.csv',
        confirmedAt: NOW.toISOString(),
      });
      h.reset();

      const refused = await h.service.confirm(ACTOR, second.id, confirmBody()).catch((e: unknown) => e);
      expect(refused).toBeInstanceOf(ImportDuplicateFileError);
      expect((refused as ImportDuplicateFileError).previous).toEqual({
        importId: first.id,
        fileName: 'first.csv',
        confirmedAt: NOW,
      });
      expect(h.calls).toEqual([
        'org.getOrganization',
        'BEGIN',
        'repo.lock(tx)',
        'repo.findCompletedWithContent(tx)',
        'ROLLBACK',
      ]);

      await h.service.confirm(ACTOR, second.id, { ...confirmBody(), acknowledgeDuplicateFile: true });
      expect((h.audits.at(-1) as { after: { repeatedFile: boolean } }).after.repeatedFile).toBe(true);
    });

    it('writes nothing and names the lines when a row is judged differently now than in the preview', async () => {
      const h = harness();
      const { id } = await upload(h, FILE);
      h.reset();
      h.dir.jobTitles[1].status = 'INACTIVE';

      const error = await h.service.confirm(ACTOR, id, confirmBody()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ImportPreviewStaleError);
      expect((error as ImportPreviewStaleError).changedLines).toEqual([3]);
      expect(h.calls).toEqual([
        'org.getOrganization',
        'BEGIN',
        'repo.lock(tx)',
        'repo.findCompletedWithContent(tx)',
        'org.getEmployee(tx)',
        'repo.rows(tx)',
        'org.lookupForEmployeeImport(tx)',
        'org.lockForEmployeeImport(tx)',
        'org.lookupForEmployeeImport(tx)',
        'ROLLBACK',
      ]);
      expect(h.created).toEqual([]);
      expect(h.imports.get(id)?.status).toBe('PREVIEW');
    });

    it('compares the stored judgement whatever order its keys came back in, but not whatever order its reasons', async () => {
      const h = harness();
      const { id } = await upload(h, FILE);
      const rows = h.storedRows.get(id) as StoredRow[];
      // PostgreSQL `jsonb` hands objects back with its own key order.
      rows[3].differences = [{ incoming: 'Hoa Vo Thi', current: 'Hoa Vo', column: 'full_name' }];
      rows[4].errors = rows[4].errors.map(({ column, code }) => ({ code, column }));

      await expect(h.service.confirm(ACTOR, id, confirmBody())).resolves.toMatchObject({ replayed: false });

      const other = harness();
      const again = await upload(other, FILE);
      const reordered = other.storedRows.get(again.id) as StoredRow[];
      reordered[4].errors = [...reordered[4].errors].reverse();

      await expect(other.service.confirm(ACTOR, again.id, confirmBody())).rejects.toMatchObject({
        changedLines: [6],
      });
    });

    it.each([
      ['code', () => new EmployeeCodeTakenError('N-2')],
      ['email', () => new EmployeeEmailTakenError()],
    ])('treats a %s taken between the judgement and the write as a stale preview of that line', async (_name, fail) => {
      const h = harness();
      const { id } = await upload(h, FILE);
      h.failCreateWith((code) => (code === 'N-2' ? fail() : undefined));
      h.reset();

      const error = await h.service.confirm(ACTOR, id, confirmBody()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ImportPreviewStaleError);
      expect((error as ImportPreviewStaleError).changedLines).toEqual([3]);
      expect(h.calls.slice(-2)).toEqual(['org.createEmployeeWithPlacement(tx, N-2)', 'ROLLBACK']);
      // The transaction rolls back with what it recorded: the import itself was never recorded as confirmed.
      expect(h.audits.filter((event) => (event as { action: string }).action === 'EMPLOYEE_IMPORT.CONFIRMED')).toEqual(
        [],
      );
    });

    it('passes any other write failure through unchanged', async () => {
      const h = harness();
      const { id } = await upload(h, FILE);
      const failure = new Error('connection reset');
      h.failCreateWith(() => failure);

      await expect(h.service.confirm(ACTOR, id, confirmBody())).rejects.toBe(failure);
      expect(h.imports.get(id)?.status).toBe('PREVIEW');
    });
  });
});
