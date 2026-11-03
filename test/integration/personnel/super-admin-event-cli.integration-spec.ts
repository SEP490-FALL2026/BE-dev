import { CLI_COLD_START_MS, cliWorkingDirectory, runCli, stopCliProcesses } from '../../support/cli-process';
import { NoticeHarness } from '../../support/notice-harness';
import { SUPER_ADMIN_EVENT_USAGE } from '../../../src/cli/record-super-admin-event/record-super-admin-event.arguments';

const COMMON = [
  '--ticket',
  'R-2026-031',
  '--approved-by',
  'cto-office',
  '--operator',
  'ops-2',
  '--environment',
  'SHARED',
  '--subject-code',
  'E-SA',
  '--basis-type',
  'DECISION',
  '--basis-reference',
  'QD-31/2026',
  '--basis-issuer',
  'Board of Directors',
  '--basis-issued-on',
  '2026-10-20',
];
const CANCEL = [
  'transfer-cancel',
  ...COMMON,
  '--transfer',
  '0191a3b4-0000-7000-8000-000000000001',
  '--reason',
  'No longer needed',
];

/**
 * `g0-g6-final-business-baseline-remediation`, Task 5.5 (F19, spec L.2, rule 8 of the operational commands): the command as a child
 * process. Only what is settled before the application starts is run here (the arguments, the usage text, the environment); every mode
 * against a database is in `super-admin-event-service.integration-spec.ts`, which runs the same service the command runs.
 */
describe('ops:record-super-admin-event (integration, real CLI)', () => {
  const cwd = cliWorkingDirectory('slm-sa-event');
  const run = (args: string[], environment: Record<string, string> = {}) =>
    runCli('record-super-admin-event', args, { cwd, environment, timeoutMs: CLI_COLD_START_MS });

  afterAll(() => {
    stopCliProcesses();
  });

  it(
    'prints the code and reason of a refused successor without writing the transfer',
    async () => {
      const h = new NoticeHarness();
      await h.start();
      try {
        const target = await h.departmentWithUnit('CLI-TARGET');
        const placement = await h.ctx.sql.query<{ department_id: string; code: string }>(
          `SELECT p.department_id, d.code FROM employee_placements p JOIN departments d ON d.id = p.department_id
         WHERE p.employee_id = $1 AND p.valid_to IS NULL`,
          [h.sa.employeeId],
        );
        const home = { id: placement.rows[0].department_id, code: placement.rows[0].code, unitId: '' };
        const heir = await h.staff(home, 'CLI-HEIR');
        await h.ctx.sql.query(
          `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
         VALUES (gen_random_uuid(), $1, $2, $3, '2026-02-01')`,
          [h.seed.organizationId, home.id, h.sa.employeeId],
        );
        const result = await run(
          [
            'transfer-record',
            ...COMMON.map((value) => (value === 'E-SA' ? 'E-ADMIN' : value)),
            '--to-department-id',
            target.id,
            '--effective-on',
            h.day(20),
            '--successor-employee-id',
            heir.employeeId,
          ],
          { NODE_ENV: 'test', DATABASE_URL: h.ctx.database.url, TEST_DATABASE_URL: h.ctx.database.url },
        );
        expect(result.code).toBe(1);
        expect(result.stderr).toContain(
          'Refused (DEPARTMENT_TRANSFER.SUCCESSOR_NOT_A_MEMBER_ON_DATE: MANAGER_ROLE_REQUIRED)',
        );
        expect(
          (await h.ctx.sql.query('SELECT 1 FROM department_transfers WHERE employee_id = $1', [h.sa.employeeId]))
            .rowCount,
        ).toBe(0);
      } finally {
        await h.stop();
      }
    },
    CLI_COLD_START_MS,
  );

  it(
    'answers --help with the usage text on stdout and exit 0, with no environment at all',
    async () => {
      const result = await run(['--help']);

      expect(result).toEqual({ code: 0, stdout: `${SUPER_ADMIN_EVENT_USAGE}\n`, stderr: '' });
    },
    CLI_COLD_START_MS,
  );

  it(
    'the usage names the ten modes and the exit codes',
    async () => {
      const { stdout } = await run(['--help']);

      for (const mode of [
        'transfer-record',
        'transfer-reschedule',
        'transfer-cancel',
        'leave-start',
        'leave-return',
        'departure-record',
        'departure-change',
        'departure-cancel',
        'abrupt-departure-record',
        'profile-correct',
      ]) {
        expect(stdout).toContain(mode);
      }
      expect(stdout).toContain('Exit codes');
    },
    CLI_COLD_START_MS,
  );

  it.each([
    ['no mode', [], 'A mode is required'],
    ['an unknown mode', ['transfer-move', ...COMMON], 'Unknown mode'],
    ['a correction with nothing to correct', ['profile-correct', ...COMMON], 'profile-correct needs at least one of'],
    [
      'a correction of the login email, which is never changed here',
      ['profile-correct', ...COMMON, '--login-email', 'a@acme.vn'],
      'Unknown option',
    ],
    [
      "an option that is not the mode's",
      [...CANCEL, '--effective-on', '2026-11-03'],
      '--effective-on does not belong to transfer-cancel',
    ],
    [
      'a missing basis part',
      ['transfer-cancel', ...COMMON.slice(0, 16), '--transfer', 'x', '--reason', 'x'],
      '--basis-issued-on is required',
    ],
  ])(
    'refuses %s with exit 1, the reason and the usage, before it reads any environment',
    async (_name, args, message) => {
      const result = await run(args);

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(message);
      expect(result.stderr).toContain(SUPER_ADMIN_EVENT_USAGE);
    },
    CLI_COLD_START_MS,
  );

  it.each(['--password', '--token', '--code', '--link', '--secret'])(
    'refuses %s by name and never echoes the value the operator typed',
    async (flag) => {
      const result = await run([...CANCEL, flag, 'hunter2-should-not-be-printed']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('takes no password, token, code or link');
      expect(result.stderr).not.toContain('hunter2-should-not-be-printed');
      expect(result.stdout).not.toContain('hunter2-should-not-be-printed');
    },
    CLI_COLD_START_MS,
  );

  it(
    'with whole arguments and no environment fails on the environment, names what is missing and writes nothing to stdout',
    async () => {
      const result = await run(CANCEL, { NODE_ENV: 'production' });

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toMatch(/DATABASE_URL|environment/i);
      expect(result.stderr).not.toContain('QD-31/2026');
      expect(result.stderr).not.toContain('E-SA');
    },
    CLI_COLD_START_MS,
  );
});
