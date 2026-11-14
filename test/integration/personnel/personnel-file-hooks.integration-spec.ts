import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { OffboardingRefusedError } from '../../../src/modules/personnel/offboarding/offboarding.errors';
import {
  PersonnelFileHookContributions,
  type PersonnelFileHook,
} from '../../../src/modules/personnel/public/personnel.extension-points';
import { OffboardingHarness } from '../../support/offboarding-harness';
import type { Department } from '../../support/request-harness';

const h = new OffboardingHarness();

type Mode = 'quiet' | 'refuses' | 'bug' | 'sql';
const BUG = 'the hook has a bug (test marker)';
/** The statement of a hook that fails in the database: PostgreSQL 42P01, then every later statement of the transaction fails 25P02. */
const MADE_UP_TABLE = 'table_that_only_this_hook_asks_for';

/**
 * OD-R10 = A (AR-14): a hook of the flows that follow a personnel file runs in the transaction of the write, like an entry of
 * `Listeners`. A hook that fails — a JavaScript error, a refusal, a failing statement — rolls the whole write back and its own error
 * reaches the exception filter; before, `PersonnelFileHooks` swallowed it, so the write committed without the work of the hook, or,
 * for a failing statement, failed later with `25P02` ("current transaction is aborted") that pointed at nothing. The departure is the
 * write under test; the hooks of the transfer, the moved day and the cancellation go through the same `each`.
 *
 * The test hook is added to the extension point the way a module adds its own, and does what a hook does: writes in the transaction
 * (an audit row before the point it fails at, one after it), then fails the way `mode` says.
 */
describe('a hook of a personnel file and the transaction of the write (integration, real PostgreSQL)', () => {
  let department: Department;
  let mode: Mode = 'quiet';
  let counter = 0;
  let realHooks: string[] = [];
  const events: string[] = [];
  let logged: jest.SpyInstance;

  beforeAll(async () => {
    await h.start();
    department = await h.departmentWithUnit('P-FH');
    const hooks = h.ctx.app.get(PersonnelFileHookContributions);
    realHooks = hooks.names();
    hooks.add('test.switch', {
      onRecorded: async (tx, event) => {
        events.push(`${event.fileKind}:${event.employeeId}`);
        await tx.$executeRaw`
          INSERT INTO audit_events (id, organization_id, actor_kind, action, resource_type, resource_id, correlation_id)
          VALUES (${randomUUID()}::uuid, ${h.seed.organizationId}::uuid, 'SYSTEM', 'TEST.HOOK_STARTED', 'personnel_file_hook_test',
                  ${event.fileId}, 'personnel-file-hook-test')`;
        if (mode === 'refuses') throw new OffboardingRefusedError('CONCURRENT_CHANGE');
        if (mode === 'bug') throw new Error(BUG);
        if (mode === 'sql') await tx.$executeRawUnsafe(`SELECT 1 FROM ${MADE_UP_TABLE}`);
        await tx.$executeRaw`
          INSERT INTO audit_events (id, organization_id, actor_kind, action, resource_type, resource_id, correlation_id)
          VALUES (${randomUUID()}::uuid, ${h.seed.organizationId}::uuid, 'SYSTEM', 'TEST.HOOK_DONE', 'personnel_file_hook_test',
                  ${event.fileId}, 'personnel-file-hook-test')`;
      },
    });
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  beforeEach(() => {
    mode = 'quiet';
    events.length = 0;
    logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  const leaver = () => {
    counter += 1;

    return h.worker(department, `E-FH-${counter}`);
  };
  /** What a write that was rolled back must not leave: rows of the departure, of its audit trail and of the test hook. */
  const footprint = async () => ({
    cases: await h.count('offboarding_cases'),
    caseChanges: await h.count('offboarding_case_changes'),
    departureAudit: (
      await h.ctx.sql.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_events WHERE action LIKE 'OFFBOARDING_CASE.%'`,
      )
    ).rows[0].n,
    hookAudit: (
      await h.ctx.sql.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_events WHERE action LIKE 'TEST.HOOK_%'`,
      )
    ).rows[0].n,
  });
  /** The status and the error code of an answer, whatever its body (a success has no error). */
  const answerOf = (response: { status: number; body: unknown }): [number, string | undefined] => [
    response.status,
    (response.body as { error?: { code?: string } }).error?.code,
  ];
  const loggedText = (): string =>
    (logged.mock.calls as unknown[][]).map((call) => call.map(String).join(' ')).join('\n');

  it('runs the hooks of the flows that follow a file, in the order their modules add them, then a hook added later', async () => {
    const person = await leaver();
    const hooks = h.ctx.app.get(PersonnelFileHookContributions);
    // The hooks are the objects the modules added; a spy on each calls through, so they do what they always do. A hook that has no
    // step for a recording (the device registrations end only when a person is `LEFT`) is left out of the order under test.
    const spies = hooks
      .all()
      .filter((hook) => typeof hook.onRecorded === 'function')
      .map((hook) => jest.spyOn(hook as Required<PersonnelFileHook>, 'onRecorded'));

    const wire = await h.recordedCase(person);

    expect(realHooks.filter((name) => name !== 'personnel.device-registration')).toEqual([
      // X-IT.3 (R-8): what an IT Admin who leaves answers for in the catalog is kept with the file, first of the flows that follow it.
      'personnel.it-handover',
      // MF3-C.2 (QĐ-110r): a departure recorded in the grace of a transfer closes it as superseded, before the flows that follow the file.
      'personnel.transfer-closure',
      'personnel.open-requests',
      'personnel.role-duties',
    ]);
    expect(realHooks).toContain('personnel.device-registration');
    expect(hooks.names()).toEqual([...realHooks, 'test.switch']);
    expect(spies.map((spy) => spy.mock.calls.length)).toEqual([1, 1, 1, 1, 1]);
    const order = spies.map((spy) => spy.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((first, second) => first - second));
    expect(spies[0].mock.calls[0][1]).toEqual({
      fileKind: 'OFFBOARDING',
      fileId: wire.id,
      employeeId: person.employeeId,
      dueOn: expect.any(String) as string,
    });
    expect(events).toEqual([`OFFBOARDING:${person.employeeId}`]);
    const rows = await h.ctx.sql.query<{ action: string }>(
      `SELECT action FROM audit_events WHERE resource_id = $1 AND action LIKE 'TEST.HOOK_%' ORDER BY action`,
      [wire.id],
    );
    expect(rows.rows.map((row) => row.action)).toEqual(['TEST.HOOK_DONE', 'TEST.HOOK_STARTED']);
    expect(await h.caseCount(person.employeeId)).toBe(1);
    expect(loggedText()).toBe('');
    spies.forEach((spy) => spy.mockRestore());
  });

  it('rolls the whole departure back when a hook refuses, and answers with the refusal the hook raised', async () => {
    mode = 'refuses';
    const person = await leaver();
    const before = await footprint();
    const workBefore = await h.workState(person.employeeId);

    const response = await h.recordCase(h.body(person));

    expect(answerOf(response)).toEqual([409, 'OFFBOARDING_CASE.CONCURRENT_CHANGE']);
    expect(events).toEqual([`OFFBOARDING:${person.employeeId}`]);
    expect(await footprint()).toEqual(before);
    expect(await h.caseCount(person.employeeId)).toBe(0);
    expect(await h.workState(person.employeeId)).toBe(workBefore);
  });

  it('rolls the whole departure back when a hook throws a JavaScript error, and the exception filter gets that error', async () => {
    mode = 'bug';
    const person = await leaver();
    const before = await footprint();

    const response = await h.recordCase(h.body(person));

    expect(answerOf(response)).toEqual([500, 'INTERNAL_SERVER_ERROR']);
    expect(loggedText()).toContain(`Error: ${BUG}`);
    expect(await footprint()).toEqual(before);
    expect(await h.caseCount(person.employeeId)).toBe(0);
  });

  it("rolls the whole departure back when a statement of a hook fails, and the error that reaches the filter is the hook's, not a later 25P02", async () => {
    mode = 'sql';
    const person = await leaver();
    const before = await footprint();

    const response = await h.recordCase(h.body(person));

    expect(answerOf(response)).toEqual([500, 'INTERNAL_SERVER_ERROR']);
    expect(loggedText()).toContain('42P01');
    expect(loggedText()).not.toContain('25P02');
    expect(await footprint()).toEqual(before);
    expect(await h.caseCount(person.employeeId)).toBe(0);
  });

  it('records the same departure once the hook stops failing: nothing of the failed attempts was kept', async () => {
    const person = await leaver();
    mode = 'bug';
    await h.recordCase(h.body(person)).expect(500);
    mode = 'quiet';

    const wire = await h.recordedCase(person);

    expect(await h.caseCount(person.employeeId)).toBe(1);
    expect(await h.auditEventsOf('OFFBOARDING_CASE.RECORDED', wire.id)).toHaveLength(1);
  });
});
