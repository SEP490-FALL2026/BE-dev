import { MAX_DATA_ROWS, readEmployeeFile } from './employee-import-file.policy';
import {
  ImportFileInvalidError,
  ImportFileMissingColumnsError,
  ImportFileUnreadableError,
} from '../employee-import.errors';

const HEADER = 'employee_code,full_name,work_email,employment_type,hire_date,department_code,job_title';
const read = (text: string) => readEmployeeFile(Buffer.from(text, 'utf8'));

describe('readEmployeeFile (US-02-01, US-02-02 AC-2)', () => {
  it('keeps the seven columns of each row by name, numbers rows by their line, and lists the headers it ignores', () => {
    const file = read(`${HEADER},notes\nN-1,Binh Tran,binh@acme.vn,STAFF,2026-10-01,P-OPS,Administrator,first\n`);

    expect(file).toEqual({
      ignored: ['notes'],
      rows: [
        {
          lineNumber: 2,
          cells: {
            employee_code: 'N-1',
            full_name: 'Binh Tran',
            work_email: 'binh@acme.vn',
            employment_type: 'STAFF',
            hire_date: '2026-10-01',
            department_code: 'P-OPS',
            job_title: 'Administrator',
          },
        },
      ],
    });
  });

  it('reads aliases in any order, a semicolon file with a byte order mark, and has no cell for a column the file lacks', () => {
    const file = read(
      '\uFEFFChức vụ;Mã NV;Họ tên;Loại nhân sự;Ngày vào;Phòng ban;Mã NV\n\nDesigner;N-7;Em Do;STAFF;2026-10-03;P-DES;dup\n',
    );

    expect(file.ignored).toEqual(['Mã NV']);
    expect(file.rows).toEqual([
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
      },
    ]);
  });

  it('gives an empty cell for a row shorter than the header', () => {
    expect(read(`${HEADER}\nN-1,Binh Tran\n`).rows[0].cells).toMatchObject({ full_name: 'Binh Tran', job_title: '' });
  });

  it(`takes ${MAX_DATA_ROWS} rows and refuses one more`, () => {
    const rows = (n: number) =>
      [HEADER, ...Array.from({ length: n }, (_, i) => `M-${i},P,,STAFF,2026-10-01,P-OPS,Administrator`)].join('\n');

    expect(read(rows(MAX_DATA_ROWS)).rows).toHaveLength(MAX_DATA_ROWS);
    expect(() => read(rows(MAX_DATA_ROWS + 1))).toThrow(ImportFileInvalidError);
    try {
      read(rows(MAX_DATA_ROWS + 1));
    } catch (error) {
      expect(error).toMatchObject({ problem: 'FILE_TOO_MANY_ROWS', details: { maxRows: 1000 } });
    }
  });

  it.each<[string, Buffer, object]>([
    ['empty', Buffer.alloc(0), { constructor: ImportFileInvalidError, problem: 'FILE_EMPTY' }],
    ['not text', Buffer.from([0x61, 0x00]), { constructor: ImportFileInvalidError, problem: 'FILE_NOT_TEXT' }],
    ['blank lines only', Buffer.from('\n\r\n  \n'), { constructor: ImportFileInvalidError, problem: 'FILE_EMPTY' }],
    ['a header only', Buffer.from(`${HEADER}\n`), { constructor: ImportFileInvalidError, problem: 'FILE_EMPTY' }],
    [
      'missing required columns',
      Buffer.from('work_email\nx@acme.vn\n'),
      {
        constructor: ImportFileMissingColumnsError,
        missing: ['employee_code', 'full_name', 'employment_type', 'hire_date', 'department_code'],
      },
    ],
    [
      'unreadable',
      Buffer.from(`${HEADER}\n"open`),
      { constructor: ImportFileUnreadableError, reason: 'UNTERMINATED_QUOTE', line: 2 },
    ],
  ])('refuses a file that is %s, as a whole', (_name, bytes, expected) => {
    let thrown: unknown;
    try {
      readEmployeeFile(bytes);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject(expected);
  });
});
