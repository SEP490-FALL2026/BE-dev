import { historyOf, judgeConversion } from './migration-preflight-judgement.policy';
import {
  ConversionFacts,
  FORWARD_MIGRATION,
  ServiceAccountFacts,
  UNIT_ONLY_MIGRATION,
} from '../public/migration-preflight.types';

const account = (overrides: Partial<ServiceAccountFacts>): ServiceAccountFacts => ({
  assignmentId: 'a-1',
  employeeCode: 'E-1',
  validFrom: '2026-10-01',
  recordedOn: '2026-10-12',
  startDepartment: 'OPS',
  storedDepartment: null,
  recordedDepartment: 'OPS',
  ...overrides,
});
const facts = (overrides: Partial<ConversionFacts> = {}): ConversionFacts => ({
  serviceAccounts: [],
  companyAllocations: [],
  companyDepartments: [],
  companyCostCenters: [],
  ...overrides,
});
const done = (name: string) => ({ name, finished: true, rolledBack: false });
const failed = (name: string) => ({ name, finished: false, rolledBack: false });

describe('historyOf (where a database stands against the two migrations)', () => {
  it('reads no table as not installed, and the two migrations in order', () => {
    expect(historyOf(null)).toBe('NOT_INSTALLED');
    expect(historyOf([done('20261022110000_x')])).toBe('BEFORE_UNIT_ONLY');
    expect(historyOf([done(UNIT_ONLY_MIGRATION)])).toBe('UNIT_ONLY_APPLIED');
    expect(historyOf([done(UNIT_ONLY_MIGRATION), done(FORWARD_MIGRATION)])).toBe('CONVERGED');
  });

  it('reads a failed attempt that was never resolved as failed, and one rolled back as not applied', () => {
    expect(historyOf([failed(UNIT_ONLY_MIGRATION)])).toBe('UNIT_ONLY_FAILED');
    expect(historyOf([done(UNIT_ONLY_MIGRATION), failed(FORWARD_MIGRATION)])).toBe('FORWARD_FAILED');
    expect(historyOf([{ name: UNIT_ONLY_MIGRATION, finished: false, rolledBack: true }])).toBe('BEFORE_UNIT_ONLY');
  });
});

describe('judgeConversion', () => {
  it('before the merged migration: the start-day department is what it reads, the recorded day what the app reads', () => {
    const report = judgeConversion(
      'BEFORE_UNIT_ONLY',
      facts({
        serviceAccounts: [
          account({ assignmentId: 'same' }),
          account({ assignmentId: 'moved', startDepartment: 'OPS', recordedDepartment: 'ENG' }),
        ],
        companyCostCenters: [{ code: 'CC-CORP', status: 'ACTIVE' }],
      }),
    );

    expect(report).toEqual({
      status: 'READY',
      history: 'BEFORE_UNIT_ONLY',
      blockers: [],
      corrections: [{ assignmentId: 'moved', recordedOn: '2026-10-12', fromDepartment: 'OPS', toDepartment: 'ENG' }],
      companyCostCentersRemoved: [{ code: 'CC-CORP', status: 'ACTIVE' }],
      information: [],
    });
  });

  it('blocks what the merged migration or the recorded-day rule cannot carry, sorted by code then row', () => {
    const report = judgeConversion(
      'BEFORE_UNIT_ONLY',
      facts({
        serviceAccounts: [
          account({ assignmentId: 'z-no-start', startDepartment: null }),
          account({ assignmentId: 'b-no-recorded', recordedDepartment: null }),
          account({ assignmentId: 'a-no-start', startDepartment: null }),
        ],
        companyAllocations: [{ versionId: 'v-1', version: 2, costCenter: 'CC-CORP' }],
        companyDepartments: [{ department: 'HQ', costCenter: 'CC-CORP' }],
      }),
    );

    expect(report.status).toBe('BLOCKED');
    expect(report.blockers).toEqual([
      { code: 'COST_ALLOCATION_NAMES_COMPANY', versionId: 'v-1', version: 2, costCenter: 'CC-CORP' },
      { code: 'DEPARTMENT_CHARGED_TO_COMPANY', department: 'HQ', costCenter: 'CC-CORP' },
      {
        code: 'SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_RECORDED_DAY',
        assignmentId: 'b-no-recorded',
        employeeCode: 'E-1',
        recordedOn: '2026-10-12',
      },
      {
        code: 'SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_START',
        assignmentId: 'a-no-start',
        employeeCode: 'E-1',
        validFrom: '2026-10-01',
      },
      {
        code: 'SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_START',
        assignmentId: 'z-no-start',
        employeeCode: 'E-1',
        validFrom: '2026-10-01',
      },
    ]);
    expect(report.corrections).toEqual([]);
  });

  it('after the merged migration: compares the stored owner with the recorded day, and blocks a day with none', () => {
    const report = judgeConversion(
      'UNIT_ONLY_APPLIED',
      facts({
        serviceAccounts: [
          account({ assignmentId: 'kept', startDepartment: null, storedDepartment: 'OPS' }),
          account({ assignmentId: 'moved', startDepartment: null, storedDepartment: 'OPS', recordedDepartment: 'ENG' }),
          account({ assignmentId: 'none', startDepartment: null, storedDepartment: 'OPS', recordedDepartment: null }),
        ],
      }),
    );

    expect(report.blockers).toEqual([
      {
        code: 'SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_RECORDED_DAY',
        assignmentId: 'none',
        employeeCode: 'E-1',
        recordedOn: '2026-10-12',
      },
    ]);
    expect(report.corrections).toEqual([
      { assignmentId: 'moved', recordedOn: '2026-10-12', fromDepartment: 'OPS', toDepartment: 'ENG' },
    ]);
  });

  it('a failed migration blocks with its name, and the data facts of the schema it left are still reported', () => {
    expect(
      judgeConversion('UNIT_ONLY_FAILED', facts({ serviceAccounts: [account({ startDepartment: null })] })).blockers,
    ).toEqual([
      { code: 'MIGRATION_FAILED', migration: UNIT_ONLY_MIGRATION },
      {
        code: 'SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_START',
        assignmentId: 'a-1',
        employeeCode: 'E-1',
        validFrom: '2026-10-01',
      },
    ]);
    expect(judgeConversion('FORWARD_FAILED', facts()).blockers).toEqual([
      { code: 'MIGRATION_FAILED', migration: FORWARD_MIGRATION },
    ]);
  });

  it('a fresh or converged database has nothing to convert', () => {
    expect(judgeConversion('NOT_INSTALLED', facts())).toMatchObject({ status: 'READY', blockers: [], corrections: [] });
    expect(judgeConversion('CONVERGED', facts())).toMatchObject({ status: 'READY', blockers: [], corrections: [] });
  });
});
