import { ConfigService } from '@nestjs/config';
import { DatabaseEnvironmentVariables } from '../../../infrastructure/config/env-schema';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { LocalDemoAccountApi } from '../../identity-access/public/local-demo-account.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { DevSeedRepo } from '../dev-seed/dev-seed.repo';
import { DevSeedApi } from './dev-seed.api';

const LOCAL = 'postgresql://app:app@127.0.0.1:5432/slm';
const tx = { tx: true } as unknown as DbTx;

type Lookup = Awaited<ReturnType<OrganizationApi['lookupForEmployeeImport']>>;
type Fixture = Awaited<ReturnType<OrganizationApi['readLocalSeedFixture']>>;
/** The fixture facts as the seed reads them: the two items. The activation of the compatibility release is not read any more. */
const fixtureOf = (parts: Pick<Fixture, 'costCenter' | 'department'>): Fixture => parts as Fixture;
const noFixture = fixtureOf({ costCenter: null, department: null });
/** The organization fixture items exactly as the seed writes them (P23-RV-01): the department and its Cost Center. */
const exactFixture = fixtureOf({
  costCenter: {
    id: 'cc-1',
    code: 'DEMO-CC',
    name: 'Demo cost center',
    kind: 'UNIT',
    status: 'ACTIVE',
    departmentCode: 'DEMO',
  },
  department: {
    id: 'd-1',
    code: 'DEMO',
    name: 'Demo department',
    status: 'ACTIVE',
    costCenterId: 'cc-1',
    costCenterCode: 'DEMO-CC',
  },
});
const empty: Lookup = { departments: [], employees: [], emailOwners: [] };
const seeded: Lookup = {
  departments: [{ id: 'd-1', code: 'DEMO', active: true }],
  employees: [
    ['DEMO-IT', 'Demo IT Admin', 'it.admin@demo.slm.test'],
    ['DEMO-FIN', 'Demo Finance', 'finance@demo.slm.test'],
    ['DEMO-EMP', 'Demo Employee', 'employee@demo.slm.test'],
  ].map(([employeeCode, fullName, workEmail], index) => ({
    id: `e-${index}`,
    employeeCode,
    fullName,
    workEmail,
    employmentType: 'STAFF' as const,
    hireDate: '2026-01-05',
    departmentCode: 'DEMO',
    jobTitleName: null,
  })),
  emailOwners: [],
};

function build(
  options: {
    nodeEnv?: string;
    databaseUrl?: string;
    lookup?: Lookup[];
    fixtures?: Fixture[];
    installed?: boolean;
    account?: string;
  } = {},
) {
  const lookups = [...(options.lookup ?? [empty, empty])];
  // A run that finds the demo people also finds the organization fixture they were created in.
  const fixtures = [
    ...(options.fixtures ?? lookups.map((lookup) => (lookup.employees.length > 0 ? exactFixture : noFixture))),
  ];
  const events: string[] = [];
  const config = {
    get: jest.fn((key: string) =>
      key === 'NODE_ENV' ? (options.nodeEnv ?? 'development') : (options.databaseUrl ?? LOCAL),
    ),
  };
  const runner = { run: jest.fn((work: (client: DbTx) => Promise<unknown>) => work(tx)) };
  const repo = { lockDevSeed: jest.fn(() => void events.push('lock')) };
  const organization = {
    getOrganization: jest.fn().mockResolvedValue(options.installed === false ? null : { id: 'org-1' }),
    readLocalSeedFixture: jest.fn(() => Promise.resolve(fixtures.shift() ?? noFixture)),
    lookupForEmployeeImport: jest.fn(() => Promise.resolve(lookups.shift() ?? empty)),
    createUnitCostCenter: jest.fn((_tx: DbTx, input: { departmentId: string }) => {
      events.push(`costCenter for ${input.departmentId}`);
      return Promise.resolve({ id: 'cc-1' });
    }),
    createDepartment: jest.fn(() => (events.push('department'), Promise.resolve({ id: 'd-1' }))),
    // No `activateCostCenterDirectionForLocalSeed` here: the seed writes no activation row, and a call to it would throw.
    createEmployeeWithPlacement: jest.fn((_tx: DbTx, input: { employeeCode: string; jobTitle: string | null }) => {
      events.push(`employee ${input.employeeCode} ${String(input.jobTitle)}`);
      return Promise.resolve({ id: `e-${input.employeeCode}` });
    }),
  };
  const identity = {
    prepareCredential: jest.fn((password: string) =>
      Promise.resolve({ hash: `hash(${password})`, hashPolicyVersion: 1 }),
    ),
  };
  const accounts = {
    describeDemoAccount: jest.fn().mockResolvedValue({ state: options.account ?? 'absent' }),
    createDemoAccount: jest.fn((_tx: DbTx, input: { role: string; passwordHash: string }) => {
      events.push(`account ${input.role} ${input.passwordHash}`);
      return Promise.resolve({ appUserId: `u-${input.role}` });
    }),
  };
  const audit = {
    record: jest.fn((_tx: DbTx, event: { action: string; operatorReference: string }) => {
      events.push(`audit ${event.action} ${event.operatorReference}`);
      return Promise.resolve();
    }),
  };
  let counter = 0;
  const generate = jest.fn(() => `generated-password-${++counter}`);
  const service = new DevSeedApi(
    config as unknown as ConfigService<DatabaseEnvironmentVariables, true>,
    runner as unknown as TransactionRunner,
    repo as unknown as DevSeedRepo,
    organization as unknown as OrganizationApi,
    identity as unknown as IdentityAccessApi,
    accounts as unknown as LocalDemoAccountApi,
    audit as unknown as AuditApi,
    generate,
  );
  return { service, runner, organization, identity, accounts, audit, generate, events };
}

describe('DevSeedApi', () => {
  it.each([
    ['production', LOCAL, true, 'ENVIRONMENT_NOT_LOCAL'],
    ['development', 'postgresql://app@postgres:5432/slm', true, 'DATABASE_NOT_LOOPBACK'],
    ['development', LOCAL, false, 'CONFIRMATION_MISSING'],
  ])(
    'refuses NODE_ENV=%s / %s / confirm=%s before touching the database',
    async (nodeEnv, databaseUrl, confirmLocal, refusal) => {
      const { service, runner, generate } = build({ nodeEnv, databaseUrl });

      await expect(service.seed({ confirmLocal })).resolves.toEqual({ outcome: 'REFUSED', refusal, items: [] });
      expect(runner.run).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
    },
  );

  it('refuses without an installation and never installs', async () => {
    const { service, runner } = build({ installed: false });

    await expect(service.seed({ confirmLocal: true })).resolves.toEqual({
      outcome: 'REFUSED',
      refusal: 'NOT_INSTALLED',
      items: [],
    });
    expect(runner.run).toHaveBeenCalledTimes(1);
  });

  it('creates everything in one locked transaction, through the services, with the Audit Trail, and shows each password once', async () => {
    const { service, runner, identity, events } = build();

    const result = await service.seed({ confirmLocal: true });

    expect(result.outcome).toBe('CREATED');
    expect(runner.run).toHaveBeenCalledTimes(2);
    expect(identity.prepareCredential).toHaveBeenCalledTimes(3);
    expect(events).toEqual([
      'lock',
      'department',
      'audit DEV_SEED.DEPARTMENT_CREATED LOCAL_SEED',
      'costCenter for d-1',
      'audit DEV_SEED.COST_CENTER_CREATED LOCAL_SEED',
      ...[
        ['DEMO-IT', 'IT_ADMIN', 1],
        ['DEMO-FIN', 'FINANCE', 2],
        ['DEMO-EMP', 'EMPLOYEE', 3],
      ].flatMap(([code, role, n]) => [
        `employee ${code} null`,
        'audit DEV_SEED.EMPLOYEE_CREATED LOCAL_SEED',
        `account ${role} hash(generated-password-${n})`,
        'audit DEV_SEED.ACCOUNT_CREATED LOCAL_SEED',
        'audit ROLE.GRANTED LOCAL_SEED',
      ]),
    ]);
    expect(result.items.filter((item) => item.password).map((item) => [item.key, item.role, item.password])).toEqual([
      ['DEMO-IT', 'IT_ADMIN', 'generated-password-1'],
      ['DEMO-FIN', 'FINANCE', 'generated-password-2'],
      ['DEMO-EMP', 'EMPLOYEE', 'generated-password-3'],
    ]);
  });

  it('never puts a password or its hash in the Audit Trail', async () => {
    const { service, audit } = build();

    await service.seed({ confirmLocal: true });

    expect(JSON.stringify(audit.record.mock.calls)).not.toMatch(/generated-password|hash\(/);
  });

  it('writes nothing, generates no password and shows none when everything is already present', async () => {
    const { service, runner, generate, events } = build({ lookup: [seeded], account: 'present' });

    const result = await service.seed({ confirmLocal: true });

    expect(result.outcome).toBe('ALREADY_PRESENT');
    expect(result.items.every((item) => item.state === 'already-present' && item.password === undefined)).toBe(true);
    expect(runner.run).toHaveBeenCalledTimes(1);
    expect(generate).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('refuses the whole run on a conflict and repairs nothing', async () => {
    const differing = {
      ...seeded,
      employees: seeded.employees.map((e) => (e.employeeCode === 'DEMO-FIN' ? { ...e, fullName: 'Real Person' } : e)),
    };
    const { service, generate, events } = build({ lookup: [differing], account: 'present' });

    const result = await service.seed({ confirmLocal: true });

    expect(result).toMatchObject({ outcome: 'REFUSED', refusal: 'CONFLICT' });
    expect(result.items).toContainEqual({
      kind: 'EMPLOYEE',
      key: 'DEMO-FIN',
      state: 'conflict',
      reason: 'EMPLOYEE_DIFFERS',
    });
    expect(generate).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('refuses and writes nothing when the data changed between the plan and the locked re-read', async () => {
    const { service, events } = build({ lookup: [empty, seeded] });

    await expect(service.seed({ confirmLocal: true })).resolves.toEqual({
      outcome: 'REFUSED',
      refusal: 'STATE_CHANGED',
      items: [],
    });
    expect(events).toEqual(['lock']);
  });

  it('P23-RV-01 / QĐ-87d(1): reuses a DEMO department that has no Cost Center and creates only the Cost Center for it', async () => {
    const recovered = fixtureOf({
      costCenter: null,
      department: { ...exactFixture.department!, costCenterId: null, costCenterCode: null },
    });
    const { service, events } = build({ fixtures: [recovered, recovered] });

    const result = await service.seed({ confirmLocal: true });

    expect(result.outcome).toBe('CREATED');
    expect(result.items.slice(0, 2).map((item) => `${item.kind} ${item.state}`)).toEqual([
      'DEPARTMENT already-present',
      'COST_CENTER created',
    ]);
    expect(events.slice(0, 3)).toEqual(['lock', 'costCenter for d-1', 'audit DEV_SEED.COST_CENTER_CREATED LOCAL_SEED']);
    expect(events).not.toContain('department');
  });

  it('writes no activation of the Cost Center link and reports no item for it, however the data stands', async () => {
    const { service, events, organization } = build();

    const result = await service.seed({ confirmLocal: true });

    expect(result.items.map((item) => item.kind)).not.toContain('COST_CENTER_DIRECTION');
    expect(events.filter((event) => /activation|DIRECTION/i.test(event))).toEqual([]);
    expect(organization).not.toHaveProperty('activateCostCenterDirectionForLocalSeed');
  });

  it('QĐ-87d(1): refuses a DEMO-CC that belongs to no department and writes nothing — only the link procedure links it', async () => {
    const unlinked = fixtureOf({
      costCenter: { ...exactFixture.costCenter!, departmentCode: null },
      department: null,
    });
    const { service, generate, events } = build({ fixtures: [unlinked] });

    const result = await service.seed({ confirmLocal: true });

    expect(result).toMatchObject({ outcome: 'REFUSED', refusal: 'CONFLICT' });
    expect(result.items).toContainEqual({
      kind: 'COST_CENTER',
      key: 'DEMO-CC',
      state: 'conflict',
      reason: 'COST_CENTER_UNLINKED',
    });
    expect(generate).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('P23-RV-01: refuses a DEMO department on another Cost Center and writes nothing', async () => {
    const elsewhere = fixtureOf({
      costCenter: null,
      department: { ...exactFixture.department!, costCenterId: 'cc-9', costCenterCode: 'OTHER-CC' },
    });
    const { service, generate, events } = build({ fixtures: [elsewhere] });

    const result = await service.seed({ confirmLocal: true });

    expect(result).toMatchObject({ outcome: 'REFUSED', refusal: 'CONFLICT' });
    expect(result.items).toContainEqual({
      kind: 'DEPARTMENT',
      key: 'DEMO',
      state: 'conflict',
      reason: 'DEPARTMENT_COST_CENTER_DIFFERS',
    });
    expect(generate).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });
});
