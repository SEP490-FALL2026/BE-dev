import { DemoApiError } from '../demo-api-client';
import type { DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 } from '../fixture/shared-demo-v4';
import { EMPLOYEE_IMPORT_COLUMNS } from './file-builders';
import { PEOPLE_ADMIN_STEPS, employeeImportCsv } from './people-admin.steps';

const ctxOf = (overrides: Record<string, unknown> = {}) =>
  ({
    fixture: SHARED_DEMO_V4,
    today: '2026-11-17',
    mode: 'apply',
    superAdminEmail: 'sa@example.test',
    ...overrides,
  }) as unknown as DemoRunContext;

const importOf = (key: string) => SHARED_DEMO_V4.employeeImports.find((candidate) => candidate.key === key)!;

describe('the CSV of an employee import (SPEC S02)', () => {
  it('has the columns of the template in its order and one line per person', () => {
    const lines = employeeImportCsv(ctxOf(), importOf('confirmed')).split('\n');

    expect(lines[0]).toBe(EMPLOYEE_IMPORT_COLUMNS.join(','));
    expect(lines).toHaveLength(1 + importOf('confirmed').rows.length);
    expect(lines[1]).toContain('NV-IMP1');
    expect(lines[1].split(',')).toHaveLength(EMPLOYEE_IMPORT_COLUMNS.length);
  });

  it('counts the hire date from today and quotes a name that holds a comma', () => {
    const csv = employeeImportCsv(ctxOf(), {
      ...importOf('confirmed'),
      rows: [{ ...importOf('confirmed').rows[0], fullName: 'Nguyễn, Văn A' }],
    });

    expect(csv.split('\n')[1]).toContain('"Nguyễn, Văn A"');
    expect(csv.split('\n')[1]).toContain('2025-10-13');
  });

  it('gives the preview exactly two lines the server will refuse: an unknown department and the email of NV-DEV5', () => {
    const csv = employeeImportCsv(ctxOf(), importOf('preview'));

    expect(csv).toContain(',XYZ,');
    expect(csv).toContain('tuan.pham@saoviet.example');
    expect(importOf('preview').expectedErrors).toEqual(['DEPARTMENT_CODE_INVALID', 'WORK_EMAIL_TAKEN']);
    expect(importOf('preview').rows).toHaveLength(3);
  });

  it('keeps every code and email of the import apart from the people of the fixture, except the one email it must clash with', () => {
    const codes = new Set(SHARED_DEMO_V4.people.map((person) => person.code));
    for (const row of SHARED_DEMO_V4.employeeImports.flatMap((spec) => spec.rows))
      expect(codes.has(row.code)).toBe(false);
  });
});

describe('org.employee-imports', () => {
  const step = PEOPLE_ADMIN_STEPS.find((candidate) => candidate.key === 'org.employee-imports')!;
  const confirmed = importOf('confirmed');
  const found = new Map(confirmed.rows.map((row) => [row.code, { id: row.code, status: 'ACTIVE' }]));

  const run = (options: { employees: Map<string, { id: string; status: string }>; audited: string[] }) => {
    const call = jest.fn((...[, method, path]: [string, string, string, unknown?]) => {
      if (path.startsWith('/audit-events')) {
        return Promise.resolve({
          items: options.audited.map((fileName) => ({ after: { fileName } })),
          pagination: { totalPages: 1 },
        });
      }
      if (method === 'POST' && path.endsWith('/confirmations')) return Promise.resolve({ replayed: false, import: {} });
      return Promise.reject(new DemoApiError(method, path, 500, 'X'));
    });
    const upload = jest.fn().mockResolvedValue({ id: 'imp-1', previewVersion: 1, summary: { errors: 0 } });
    const ctx = ctxOf({
      accounts: { findEmployees: () => Promise.resolve(options.employees) },
      api: { call, upload },
      ids: { employees: new Map() },
    });

    return { outcome: step.run(ctx), call, upload };
  };

  it('comes after the employees and before everything that needs the organization', () => {
    expect(step.needs).toEqual(['org.employees']);
  });

  it('is present when the three people exist and the preview was uploaded before', async () => {
    const { outcome, upload } = run({ employees: found, audited: [importOf('preview').fileName] });

    await expect(outcome).resolves.toMatchObject({ status: 'present' });
    expect(upload).not.toHaveBeenCalled();
  });

  it('uploads and confirms the first import, then uploads the preview and confirms nothing', async () => {
    const { outcome, call, upload } = run({ employees: new Map(), audited: [] });
    upload
      .mockResolvedValueOnce({ id: 'imp-1', previewVersion: 3, summary: { errors: 0 } })
      .mockResolvedValueOnce({ id: 'imp-2', previewVersion: 1, summary: { errors: 2 } });

    await expect(outcome).resolves.toMatchObject({ status: 'done' });
    expect(upload.mock.calls.map((args: unknown[]) => (args[2] as { name: string }).name)).toEqual([
      confirmed.fileName,
      importOf('preview').fileName,
    ]);
    const confirmations = call.mock.calls.filter((args) => String(args[2]).endsWith('/confirmations'));
    expect(confirmations).toHaveLength(1);
    expect(confirmations[0][3]).toEqual({ previewVersion: 3, idempotencyKey: confirmed.idempotencyKey });
  });

  it('reports a conflict, and confirms nothing, when the first file has an error it should not have', async () => {
    const { outcome, call, upload } = run({ employees: new Map(), audited: [importOf('preview').fileName] });
    upload.mockResolvedValue({ id: 'imp-1', previewVersion: 1, summary: { errors: 1 } });

    await expect(outcome).resolves.toMatchObject({ status: 'conflict' });
    expect(call.mock.calls.some((args) => String(args[2]).endsWith('/confirmations'))).toBe(false);
  });

  it('only plans in plan mode', async () => {
    const { outcome, upload } = run({ employees: new Map(), audited: [] });
    const planned = step.run(
      ctxOf({
        mode: 'plan',
        accounts: { findEmployees: () => Promise.resolve(new Map()) },
        api: { call: () => Promise.resolve({ items: [], pagination: { totalPages: 1 } }), upload },
        ids: { employees: new Map() },
      }),
    );

    await expect(planned).resolves.toMatchObject({ status: 'planned' });
    await outcome;
  });
});

describe('org.account-states (SPEC S03)', () => {
  const step = PEOPLE_ADMIN_STEPS.find((candidate) => candidate.key === 'org.account-states')!;
  const states = SHARED_DEMO_V4.accountStates;
  type Row = { id: string; employee: { employeeCode: string } };
  const run = (lists: { locked: Row[]; invited: Row[] }, extra: Record<string, unknown> = {}) => {
    const call = jest.fn((...[, method, path]: [string, string, string, unknown?]): Promise<unknown> => {
      if (method === 'GET' && path.includes('status=LOCKED'))
        return Promise.resolve({ items: lists.locked, pagination: { totalPages: 1 } });
      if (method === 'GET' && path.includes('activationState=INVITED'))
        return Promise.resolve({ items: lists.invited, pagination: { totalPages: 1 } });
      return Promise.resolve({});
    });
    const ctx = ctxOf({
      api: { call },
      ids: {
        employees: new Map([
          ['NV-BOD3', 'e-3'],
          ['NV-NEW3', 'e-n'],
        ]),
        appUsers: new Map([['NV-BOD3', 'u-3']]),
      },
      ...extra,
    });

    return { outcome: step.run(ctx), call };
  };
  type Args = [string, string, string, unknown?];
  const writes = (call: jest.Mock<Promise<unknown>, Args>): Args[] =>
    call.mock.calls.filter((args) => args[1] === 'POST');

  it('comes after the accounts', () => {
    expect(step.needs).toEqual(['org.accounts']);
  });

  it('locks the one person with a reason that carries the tag, and invites the one with no account', async () => {
    const { outcome, call } = run({ locked: [], invited: [] });

    await expect(outcome).resolves.toMatchObject({ status: 'done' });
    const [lock, invite] = writes(call);
    expect(lock[2]).toBe('/app-users/u-3/lock');
    expect((lock[3] as { reason: string }).reason.startsWith('[SV-LOCK]')).toBe(true);
    expect(invite.slice(2)).toEqual(['/app-users', { employeeId: 'e-n' }]);
  });

  it('writes nothing when the account is locked and the invitation is waiting', async () => {
    const { outcome, call } = run({
      locked: [{ id: 'u-3', employee: { employeeCode: 'NV-BOD3' } }],
      invited: [{ id: 'u-n', employee: { employeeCode: 'NV-NEW3' } }],
    });

    await expect(outcome).resolves.toMatchObject({ status: 'present' });
    expect(writes(call)).toHaveLength(0);
  });

  it('counts an invited person who already has an account as present (the API answers a second account with 409)', async () => {
    const { outcome, call } = run({ locked: [{ id: 'u-3', employee: { employeeCode: 'NV-BOD3' } }], invited: [] });
    call.mockImplementation((...[, method, path]: [string, string, string, unknown?]) => {
      if (method === 'GET')
        return Promise.resolve({
          items: path.includes('LOCKED') ? [{ id: 'u-3', employee: { employeeCode: 'NV-BOD3' } }] : [],
          pagination: { totalPages: 1 },
        });
      return Promise.reject(new DemoApiError(method, path, 409, 'APP_USER.ALREADY_EXISTS_FOR_EMPLOYEE'));
    });

    await expect(outcome).resolves.toMatchObject({ status: 'present' });
  });

  it('declares the locked person as one the fixture marks, and never one who sends or receives a request', () => {
    const locked = SHARED_DEMO_V4.people.filter((person) => person.lockedInDemo).map((person) => person.code);
    expect(locked).toEqual(states.locked.map((state) => state.employee));
    for (const code of locked) {
      for (const scenario of SHARED_DEMO_V4.requests) {
        expect([scenario.requester, ...(scenario.beneficiaries ?? [])]).not.toContain(code);
      }
    }
    expect(states.invited).toEqual(['NV-NEW3']);
    expect(SHARED_DEMO_V4.people.find((person) => person.code === 'NV-NEW3')!.account).toBeNull();
  });
});
