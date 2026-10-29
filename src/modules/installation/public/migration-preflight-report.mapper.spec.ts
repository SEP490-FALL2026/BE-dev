import { formatPreflight, preflightJson } from './migration-preflight-report.mapper';
import { PreflightReport, UNIT_ONLY_MIGRATION } from './migration-preflight.types';

const ready: PreflightReport = {
  status: 'READY',
  history: 'BEFORE_UNIT_ONLY',
  blockers: [],
  corrections: [{ assignmentId: 'a-1', recordedOn: '2026-10-12', fromDepartment: 'OPS', toDepartment: 'ENG' }],
  companyCostCentersRemoved: [{ code: 'CC-CORP', status: 'ACTIVE' }],
  information: [],
};

describe('migration preflight report', () => {
  it('prints JSON as the one object the command judged', () => {
    expect(JSON.parse(preflightJson(ready))).toEqual(ready);
  });

  it('says a ready database may be deployed, what the forward migration moves and what the merged one deletes', () => {
    const text = formatPreflight(ready);

    expect(text).toMatch(/^Preflight: READY \(BEFORE_UNIT_ONLY\)/);
    expect(text).toContain('a-1: OPS -> ENG (recorded 2026-10-12)');
    expect(text).toContain('CC-CORP (ACTIVE)');
    expect(text).toMatch(/back up the database/i);
  });

  it('names every blocked row with the decision it needs, and says not to deploy', () => {
    const text = formatPreflight({
      status: 'BLOCKED',
      history: 'UNIT_ONLY_FAILED',
      blockers: [
        { code: 'MIGRATION_FAILED', migration: UNIT_ONLY_MIGRATION },
        { code: 'COST_ALLOCATION_NAMES_COMPANY', versionId: 'v-1', version: 2, costCenter: 'CC-CORP' },
        { code: 'DEPARTMENT_CHARGED_TO_COMPANY', department: 'HQ', costCenter: 'CC-CORP' },
        {
          code: 'SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_START',
          assignmentId: 'a-2',
          employeeCode: 'E-2',
          validFrom: '2026-10-01',
        },
        {
          code: 'SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_RECORDED_DAY',
          assignmentId: 'a-3',
          employeeCode: 'E-3',
          recordedOn: '2026-10-12',
        },
      ],
      corrections: [],
      companyCostCentersRemoved: [],
      information: [],
    });

    expect(text).toMatch(/^Preflight: BLOCKED \(UNIT_ONLY_FAILED\)/);
    expect(text).toMatch(/do not run `prisma migrate deploy`/i);
    for (const named of ['v-1', 'version 2', 'HQ', 'a-2', 'E-2', '2026-10-01', 'a-3', 'E-3', UNIT_ONLY_MIGRATION]) {
      expect(text).toContain(named);
    }
    expect(text).toMatch(/Owner/);
  });
});
