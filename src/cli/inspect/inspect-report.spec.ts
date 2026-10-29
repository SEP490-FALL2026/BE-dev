import { InspectionArgumentError, parseInspectionArguments } from './inspect.arguments';
import { formatInspection, inspectionJson } from './inspect-report';
import { InstallationInspection } from '../../modules/installation/public/inspection.types';

const notInstalled: InstallationInspection = {
  status: 'NOT_INSTALLED',
  problems: [],
  migrations: { committed: 2, applied: 0, pending: ['20261001_a', '20261002_b'], failed: [], unknown: [] },
  organization: null,
  bootstrapRecords: null,
  changeAnnouncements: null,
  superAdmin: null,
  accounts: null,
  directRoles: null,
  approvalRoles: null,
  departments: null,
};

const incomplete: InstallationInspection = {
  status: 'INCOMPLETE',
  problems: ['BOOTSTRAP_RECORDS_INCOMPLETE', 'CHANGE_ANNOUNCEMENTS_MISSING', 'SUPER_ADMIN_MISSING'],
  migrations: { committed: 2, applied: 2, pending: [], failed: [], unknown: [] },
  organization: { timeZone: 'Asia/Ho_Chi_Minh', reportingCurrency: 'VND' },
  bootstrapRecords: { complete: false, mismatched: ['INSTALLATION.SUPER_ADMIN_CREATED'] },
  changeAnnouncements: { complete: false, missing: { PLACEMENT_START: 2, HEAD_PERIOD_START: 0, HEAD_PERIOD_END: 1 } },
  superAdmin: null,
  accounts: { total: 0, byState: { ACTIVE_ACTIVATED: 0, ACTIVE_INVITED: 0, LOCKED_ACTIVATED: 0, LOCKED_INVITED: 0 } },
  directRoles: { SUPER_ADMIN: 0, IT_ADMIN: 0, FINANCE: 0, EMPLOYEE: 0 },
  approvalRoles: { SPENDING_APPROVER: 0, CONFLICT_SUBSTITUTE: 0, FALLBACK_APPROVER: 0 },
  departments: { active: 1, withoutCurrentHead: 1, withoutUsableItAdmin: 1 },
};

describe('formatInspection', () => {
  it('reports a database with no installation and what to do next', () => {
    expect(formatInspection(notInstalled)).toBe(
      [
        'Installation: NOT_INSTALLED',
        'Problems: none',
        'Migrations: 2 committed, 0 applied, 2 pending, 0 failed, 0 unknown',
        '  pending: 20261001_a, 20261002_b',
        'Organization: absent',
        'Next: apply the migrations (pnpm db:migrate:deploy), then see pnpm ops:bootstrap --help.',
        '',
      ].join('\n'),
    );
  });

  it('lists the problems and every number of an incomplete installation', () => {
    expect(formatInspection(incomplete)).toBe(
      [
        'Installation: INCOMPLETE',
        'Problems: BOOTSTRAP_RECORDS_INCOMPLETE, CHANGE_ANNOUNCEMENTS_MISSING, SUPER_ADMIN_MISSING',
        'Migrations: 2 committed, 2 applied, 0 pending, 0 failed, 0 unknown',
        'Organization: present (Asia/Ho_Chi_Minh, VND)',
        'Bootstrap records: mismatched INSTALLATION.SUPER_ADMIN_CREATED',
        'Change announcements: missing PLACEMENT_START 2, HEAD_PERIOD_START 0, HEAD_PERIOD_END 1',
        'Super Admin: none',
        'Accounts: 0 (ACTIVE_ACTIVATED 0, ACTIVE_INVITED 0, LOCKED_ACTIVATED 0, LOCKED_INVITED 0)',
        'Direct roles: SUPER_ADMIN 0, IT_ADMIN 0, FINANCE 0, EMPLOYEE 0',
        'Approval roles: SPENDING_APPROVER 0, CONFLICT_SUBSTITUTE 0, FALLBACK_APPROVER 0',
        'Departments: 1 active, 1 without a current head, 1 without a usable IT Admin',
        '',
      ].join('\n'),
    );
  });

  it('says the announcements are complete when nothing was missed, and prints no id or name', () => {
    const text = formatInspection({
      ...incomplete,
      problems: [],
      status: 'INSTALLED',
      changeAnnouncements: {
        complete: true,
        missing: { PLACEMENT_START: 0, HEAD_PERIOD_START: 0, HEAD_PERIOD_END: 0 },
      },
    });

    expect(text).toContain('Change announcements: complete\n');
  });

  it('carries the same status and numbers in the JSON form', () => {
    expect(JSON.parse(inspectionJson(incomplete))).toEqual(incomplete);
    expect(inspectionJson(incomplete).endsWith('}\n')).toBe(true);
  });
});

describe('parseInspectionArguments', () => {
  it.each([
    [[], { help: false, json: false }],
    [['--json'], { help: false, json: true }],
    [['--', '--json'], { help: false, json: true }],
    [['--help'], { help: true }],
  ])('parses %j', (argv, expected) => {
    expect(parseInspectionArguments(argv)).toEqual(expected);
  });

  it.each([[['--force']], [['--write']], [['extra']], [['--json=yes']]])('refuses %j', (argv) => {
    expect(() => parseInspectionArguments(argv)).toThrow(InspectionArgumentError);
  });
});
