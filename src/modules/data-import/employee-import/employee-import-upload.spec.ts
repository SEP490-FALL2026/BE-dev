import { createHash } from 'node:crypto';
import { FAKE_CLOCK, FILE, NOW, harness, upload } from '../../../../test/support/employee-import-service-harness';
import {
  ImportFileInvalidError,
  ImportFileMissingColumnsError,
  ImportFileUnreadableError,
} from './employee-import.errors';
import { MAX_DATA_ROWS } from './employee-import-file';
import type { ImportRecord } from './employee-import.repo';
import { PREVIEW_TTL_MS } from './employee-import.service';

/* Upload and preview of a people file: what is read, judged, stored and recorded, and every refusal of a file as a
 * whole. The harness is shared with the preview-lifecycle and confirm specs (test/support/). */

describe('EmployeeImportService: upload (H8 Phase 0 characterization)', () => {
  beforeEach(() => {
    jest.useFakeTimers(FAKE_CLOCK);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('upload', () => {
    it('reads and judges every row, stores the preview and records the upload in one transaction', async () => {
      const h = harness();

      const view = await upload(h, FILE, 'people.csv');

      expect(h.calls).toEqual([
        'org.getOrganization',
        'org.lookupForEmployeeImport()',
        'repo.findCompletedWithContent()',
        'org.lookupForEmployeeImport()',
        'org.departmentsWithoutHead(d-ops,d-des)',
        'BEGIN',
        'repo.create(tx)',
        'audit.record(tx)',
        'COMMIT',
        'repo.find()',
      ]);
      expect(h.lookups[0]).toEqual({
        departmentCodes: ['P-OPS', 'P-DES', 'P-NOPE'],
        normalizedJobTitleNames: ['administrator', 'designer', 'unknown'],
        employeeCodes: ['N-1', 'N-2', 'E-001', 'E-002', 'N-3'],
        normalizedEmails: ['binh@acme.vn', 'an@acme.vn', 'hoa@acme.vn', 'dung@acme.vn'],
      });
      const summary = {
        totalRows: 5,
        valid: 2,
        errors: 1,
        existingSame: 1,
        existingDifferent: 1,
        newPeopleByDepartment: [
          { departmentCode: 'P-OPS', count: 1 },
          { departmentCode: 'P-DES', count: 1 },
        ],
        departmentsWithoutHead: [{ code: 'P-DES', name: 'Design' }],
        reviewQueue: { total: 0, items: [] },
        duplicateOf: null,
      };
      const record = h.imports.get(view.id) as ImportRecord;
      expect(record).toEqual({
        id: 'import-1',
        organizationId: 'org-1',
        uploadedBy: 'u-it',
        fileName: 'people.csv',
        contentHash: createHash('sha256').update(Buffer.from(FILE, 'utf8')).digest('hex'),
        status: 'PREVIEW',
        previewVersion: 1,
        ignoredColumns: ['notes'],
        summary,
        result: null,
        confirmKey: null,
        createdAt: NOW,
        expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
        confirmedAt: null,
        cancelledAt: null,
      });
      expect(h.storedRows.get(view.id)).toEqual([
        {
          lineNumber: 2,
          cells: {
            employee_code: 'N-1',
            full_name: 'Binh Tran',
            work_email: 'Binh@Acme.vn',
            employment_type: 'STAFF',
            hire_date: '2026-10-01',
            department_code: 'P-OPS',
            job_title: 'Administrator',
          },
          outcome: 'VALID',
          errors: [],
          differences: null,
        },
        {
          lineNumber: 3,
          cells: {
            employee_code: 'N-2',
            full_name: 'Chi Le',
            work_email: '',
            employment_type: 'intern',
            hire_date: '2026-10-02',
            department_code: 'P-DES',
            job_title: 'designer',
          },
          outcome: 'VALID',
          errors: [],
          differences: null,
        },
        {
          lineNumber: 4,
          cells: {
            employee_code: 'E-001',
            full_name: 'An Nguyen',
            work_email: 'an@acme.vn',
            employment_type: 'STAFF',
            hire_date: '2026-01-05',
            department_code: 'P-OPS',
            job_title: 'Administrator',
          },
          outcome: 'EXISTS_SAME',
          errors: [],
          differences: null,
        },
        {
          lineNumber: 5,
          cells: {
            employee_code: 'E-002',
            full_name: 'Hoa Vo Thi',
            work_email: 'hoa@acme.vn',
            employment_type: 'STAFF',
            hire_date: '2026-02-01',
            department_code: 'P-OPS',
            job_title: 'Administrator',
          },
          outcome: 'EXISTS_DIFFERENT',
          errors: [],
          differences: [{ column: 'full_name', current: 'Hoa Vo', incoming: 'Hoa Vo Thi' }],
        },
        {
          lineNumber: 6,
          cells: {
            employee_code: 'N-3',
            full_name: 'Dung Pham',
            work_email: 'dung@acme.vn',
            employment_type: 'STAFF',
            hire_date: 'not-a-date',
            department_code: 'P-NOPE',
            job_title: 'Unknown',
          },
          outcome: 'ERROR',
          errors: [
            { column: 'hire_date', code: 'HIRE_DATE_INVALID' },
            { column: 'department_code', code: 'DEPARTMENT_NOT_FOUND' },
            { column: 'job_title', code: 'JOB_TITLE_NOT_FOUND' },
          ],
          differences: null,
        },
      ]);
      expect(h.audits).toEqual([
        {
          organizationId: 'org-1',
          actorKind: 'USER',
          actorAppUserId: 'u-it',
          actorRoles: ['IT_ADMIN'],
          action: 'EMPLOYEE_IMPORT.UPLOADED',
          resourceType: 'EmployeeImport',
          resourceId: 'import-1',
          before: null,
          after: {
            fileName: 'people.csv',
            fileDigest: record.contentHash,
            rows: 5,
            valid: 2,
            errors: 1,
          },
          correlationId: 'session-1',
        },
      ]);
      expect(view).toEqual({
        id: 'import-1',
        fileName: 'people.csv',
        status: 'PREVIEW',
        previewVersion: 1,
        ignoredColumns: ['notes'],
        summary,
        result: null,
        createdAt: NOW,
        expiresAt: new Date(NOW.getTime() + PREVIEW_TTL_MS),
        confirmedAt: null,
        cancelledAt: null,
      });
    });

    it('keeps the raw cells and the file content out of the audit record', async () => {
      const h = harness();

      await upload(h, FILE);

      const text = JSON.stringify(h.audits);
      for (const cell of ['Binh Tran', 'Binh@Acme.vn', 'not-a-date', 'first', 'P-NOPE'])
        expect(text).not.toContain(cell);
    });

    it('keeps the first 255 characters of a long file name, in the record and in the audit', async () => {
      const h = harness();
      const long = `${'n'.repeat(300)}.csv`;

      await upload(h, FILE, long);

      expect(h.imports.get('import-1')?.fileName).toBe('n'.repeat(255));
      expect((h.audits[0] as { after: { fileName: string } }).after.fileName).toBe('n'.repeat(255));
    });

    it('maps columns by their names in any order and language, numbers lines as the file does, and drops empty rows', async () => {
      const h = harness();
      const text =
        '\uFEFFChức vụ;Mã NV;Họ và tên;Loại nhân sự;Ngày vào;Phòng ban;Ghi chú\n\nDesigner;N-7;Em Do;STAFF;2026-10-03;P-DES;x\n';

      const view = await upload(h, text);

      expect(view.ignoredColumns).toEqual(['Ghi chú']);
      expect(h.storedRows.get(view.id)).toEqual([
        {
          lineNumber: 3,
          cells: {
            employee_code: 'N-7',
            full_name: 'Em Do',
            employment_type: 'STAFF',
            hire_date: '2026-10-03',
            department_code: 'P-DES',
            job_title: 'Designer',
          },
          outcome: 'VALID',
          errors: [],
          differences: null,
        },
      ]);
    });

    it('takes at most the row limit, and refuses one row more', async () => {
      const rows = (n: number) =>
        [
          FILE.split('\n')[0],
          ...Array.from({ length: n }, (_, i) => `M-${i},P ${i},,STAFF,2026-10-01,P-OPS,Administrator,`),
        ].join('\n');
      const h = harness();

      expect(MAX_DATA_ROWS).toBe(1000);
      expect((await upload(h, rows(1000))).summary.totalRows).toBe(1000);

      const refused = await upload(h, rows(1001)).catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(ImportFileInvalidError);
      expect(refused).toMatchObject({ problem: 'FILE_TOO_MANY_ROWS', details: { maxRows: 1000 } });
    });

    it.each<[string, string | Buffer, (error: unknown) => void]>([
      [
        'an empty file',
        Buffer.alloc(0),
        (e) => expect(e).toMatchObject({ constructor: ImportFileInvalidError, problem: 'FILE_EMPTY', details: {} }),
      ],
      [
        'a file that is not text',
        Buffer.from([0x65, 0x00, 0x66]),
        (e) => expect(e).toMatchObject({ constructor: ImportFileInvalidError, problem: 'FILE_NOT_TEXT' }),
      ],
      [
        'blank lines only',
        '\n \n\n',
        (e) => expect(e).toMatchObject({ constructor: ImportFileInvalidError, problem: 'FILE_EMPTY' }),
      ],
      [
        'a header only',
        `${FILE.split('\n')[0]}\n`,
        (e) => expect(e).toMatchObject({ constructor: ImportFileInvalidError, problem: 'FILE_EMPTY' }),
      ],
      [
        'missing required columns',
        'code,name,email\nX,Y,z@acme.vn\n',
        (e) =>
          expect(e).toMatchObject({
            constructor: ImportFileMissingColumnsError,
            missing: ['employment_type', 'hire_date', 'department_code', 'job_title'],
          }),
      ],
      [
        'a table it cannot read',
        'employee_code,full_name\n"unterminated,x\n',
        (e) =>
          expect(e).toMatchObject({ constructor: ImportFileUnreadableError, reason: 'UNTERMINATED_QUOTE', line: 3 }),
      ],
      [
        'a stray quote',
        'employee_code,full_name\nab"c,x\n',
        (e) => expect(e).toMatchObject({ constructor: ImportFileUnreadableError, reason: 'STRAY_QUOTE', line: 2 }),
      ],
    ])('refuses %s as a whole, before reading the database or writing anything', async (_name, content, check) => {
      const h = harness();

      const error = await upload(h, content).catch((thrown: unknown) => thrown);

      check(error);
      expect(h.calls).toEqual(['org.getOrganization']);
      expect(h.imports.size).toBe(0);
    });

    it('refuses to import before installation, before anything else', async () => {
      const h = harness();
      h.withoutOrganization();

      await expect(upload(h, Buffer.alloc(0))).rejects.toThrow(
        new Error('A people file was imported before installation'),
      );
      expect(h.calls).toEqual(['org.getOrganization']);
    });
  });
});
