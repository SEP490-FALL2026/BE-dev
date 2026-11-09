import { Prisma } from '../../generated/prisma/client';
import { toTransientError } from '../../infrastructure/database/transaction-runner';
import { DemoApiError, DemoApiUnreachableError } from './demo-api-client';
import { exitCodeOf, runDemoSteps } from './seed-runner';
import { formatDemoReport } from './seed-report';
import type { DemoRunContext, DemoStep, StepOutcome } from './demo-run.types';

const ctx = (mode: 'plan' | 'apply') => ({ mode }) as DemoRunContext;
const step = (key: string, needs: string[], run: () => Promise<StepOutcome>): DemoStep => ({
  key,
  title: key,
  needs,
  run,
});

describe('the demo dataset step runner', () => {
  it('runs a step whose needs are present or done, and marks one behind a planned step as waiting (plan)', async () => {
    const reports = await runDemoSteps(ctx('plan'), [
      step('a', [], () => Promise.resolve({ status: 'present' })),
      step('b', ['a'], () => Promise.resolve({ status: 'planned' })),
      step('c', ['b'], () => Promise.resolve({ status: 'done' })),
    ]);
    expect(reports.map((report) => report.status)).toEqual(['present', 'planned', 'waiting']);
    expect(exitCodeOf('plan', reports)).toBe(0);
  });

  it('turns a business refusal into a conflict, blocks what needs it and runs the rest (apply)', async () => {
    const later = jest.fn((): Promise<StepOutcome> => Promise.resolve({ status: 'done' }));
    const reports = await runDemoSteps(ctx('apply'), [
      step('a', [], () => Promise.reject(new DemoApiError('POST', '/departments', 409, 'DEPARTMENT.CODE_TAKEN'))),
      step('b', ['a'], () => Promise.resolve({ status: 'done' })),
      step('c', [], later),
    ]);
    expect(reports.map((report) => report.status)).toEqual(['conflict', 'blocked', 'done']);
    expect(reports[0].detail).toContain('DEPARTMENT.CODE_TAKEN');
    expect(later).toHaveBeenCalled();
    expect(exitCodeOf('apply', reports)).toBe(4);
  });

  it('stops the whole run at an unreachable API or a server error: what it wrote is unknown', async () => {
    const after = jest.fn((): Promise<StepOutcome> => Promise.resolve({ status: 'done' }));
    const reports = await runDemoSteps(ctx('apply'), [
      step('a', [], () => Promise.resolve({ status: 'done' })),
      step('b', [], () => Promise.reject(new DemoApiUnreachableError('POST', '/access-requests'))),
      step('c', [], after),
    ]);
    expect(reports.map((report) => report.status)).toEqual(['done', 'failed']);
    expect(after).not.toHaveBeenCalled();
    expect(exitCodeOf('apply', reports)).toBe(1);

    const server = await runDemoSteps(ctx('apply'), [
      step('a', [], () => Promise.reject(new DemoApiError('POST', '/x', 500, 'INTERNAL_ERROR'))),
    ]);
    expect(server[0].status).toBe('failed');
  });

  it('describes an unexpected error of a step by kind and code, never by its message', async () => {
    const reports = await runDemoSteps(ctx('apply'), [
      step('a', [], () => Promise.reject(new Error('duplicate key value (login_email)=(a@x.example)'))),
    ]);

    expect(reports[0]).toMatchObject({ status: 'failed', detail: 'Error retryable=false' });
  });

  it('puts the database cause in the detail of the step that failed, and the run still exits 1', async () => {
    const outOfTime = toTransientError(
      new Prisma.PrismaClientKnownRequestError('Transaction API error: secret-host:5432', {
        code: 'P2028',
        clientVersion: '7.9.1',
      }),
    );
    const reports = await runDemoSteps(ctx('apply'), [
      step('org.accounts', [], () => Promise.reject(outOfTime ?? new Error('not a transient error'))),
    ]);

    expect(reports[0]).toMatchObject({
      status: 'failed',
      detail: 'TransientDatabaseError code=P2028 retryable=true cause=PrismaClientKnownRequestError',
    });
    expect(exitCodeOf('apply', reports)).toBe(1);
  });

  it('says there is nothing to change when every step was there (apply)', () => {
    expect(exitCodeOf('apply', [{ key: 'a', title: 'a', status: 'present' }])).toBe(2);
    expect(exitCodeOf('plan', [{ key: 'a', title: 'a', status: 'present' }])).toBe(0);
  });

  it('prints one line per step and the counts', () => {
    const text = formatDemoReport({
      fixture: 'shared-demo-v4',
      mode: 'apply',
      organization: 'Acme',
      today: '2026-10-30',
      steps: [
        { key: 'a', title: 'Phòng ban', status: 'done', detail: 'đã ghi: X' },
        { key: 'b', title: 'Nhân viên', status: 'blocked', detail: 'cần trước: a' },
      ],
      exitCode: 4,
    });
    expect(text).toContain('[ĐÃ GHI] a — Phòng ban: đã ghi: X');
    expect(text).toContain('[BỊ CHẶN] b — Nhân viên: cần trước: a');
    expect(text).toContain('mã thoát 4');
  });
});
