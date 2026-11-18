import { DemoApiError, DemoApiUnreachableError } from './demo-api-client';
import { describeDemoFailure } from './demo-failure';
import { DemoInventoryIncompleteError, DemoSignInRefusedError } from './demo-step-kit';
import type { DemoRunContext, DemoStep, StepReport, StepStatus } from './demo-run.types';

const READY: ReadonlySet<StepStatus> = new Set(['present', 'done']);
const LATER: ReadonlySet<StepStatus> = new Set(['planned', 'waiting']);

/**
 * Runs the steps in order. A step whose needs are not ready is `waiting` (plan) or `blocked` (apply) and does nothing. A
 * business refusal (4xx) of a step is that step's `conflict`: the steps that do not need it go on. Anything else (an
 * unreachable API, a 5xx) stops the run at once as `failed`, because what it wrote is unknown; the next run reads what
 * is there before it writes again. There is no transaction around the run: each API call commits on its own.
 */
export async function runDemoSteps(ctx: DemoRunContext, steps: readonly DemoStep[]): Promise<StepReport[]> {
  const reports = new Map<string, StepReport>();
  for (const step of steps) {
    const unmet = step.needs.filter((key) => !READY.has(reports.get(key)?.status ?? 'blocked'));
    if (unmet.length > 0) {
      const later = unmet.every((key) => LATER.has(reports.get(key)?.status ?? 'blocked'));
      reports.set(step.key, {
        key: step.key,
        title: step.title,
        status: later ? 'waiting' : 'blocked',
        detail: `cần trước: ${unmet.join(', ')}`,
      });
      continue;
    }
    const report = await runOne(ctx, step);
    reports.set(step.key, report);
    if (report.status === 'failed') break;
  }

  return steps.map((step) => reports.get(step.key)).filter((report): report is StepReport => report !== undefined);
}

async function runOne(ctx: DemoRunContext, step: DemoStep): Promise<StepReport> {
  try {
    const outcome = await step.run(ctx);

    return { key: step.key, title: step.title, ...outcome };
  } catch (error) {
    if (error instanceof DemoSignInRefusedError || error instanceof DemoInventoryIncompleteError) {
      return { key: step.key, title: step.title, status: 'conflict', detail: error.message };
    }
    if (error instanceof DemoApiError && error.status >= 400 && error.status < 500 && error.status !== 401) {
      return { key: step.key, title: step.title, status: 'conflict', detail: `API từ chối: ${error.message}` };
    }
    // Our own API errors are worded by construction; any other message may carry data, so only its kind and code.
    const reason =
      error instanceof DemoApiError || error instanceof DemoApiUnreachableError
        ? error.message
        : describeDemoFailure(error);

    return { key: step.key, title: step.title, status: 'failed', detail: reason };
  }
}

/** The exit code of a run: 0 done or planned, 2 nothing to change, 4 some step in conflict or blocked, 1 failed. */
export function exitCodeOf(mode: 'plan' | 'apply', reports: readonly StepReport[]): number {
  if (reports.some((report) => report.status === 'failed')) return 1;
  if (reports.some((report) => report.status === 'conflict' || report.status === 'blocked')) return 4;
  if (mode === 'apply' && reports.every((report) => report.status === 'present')) return 2;

  return 0;
}
