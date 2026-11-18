import { randomBytes } from 'node:crypto';
import { businessDateAt } from '../../../core/business-date';
import { listAll, summarize } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoDevice } from '../fixture/demo-fixture.types';
import { deviceAdmin, findDevice } from './devices.steps';

export function installKey(): string {
  return randomBytes(32).toString('base64url');
}
export function machinesToCollect<T extends { state: string }>(devices: readonly T[]): T[] {
  return devices.filter(({ state }) => state === 'ACTIVE');
}

function valueFor(assetCode: string, day: string): number {
  let hash = 0;
  for (const character of `${assetCode}:${day}`) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return (hash % 70) + 10;
}

/**
 * The usage of one day as the collector sends it. `day` is the business day of `now` on the machine (the session's time zone), not the day the
 * seed started: a first run that passes midnight acknowledges on the new day, and the server takes no day before the acknowledgement.
 */
export function usageBatchBody(ctx: DemoRunContext, machine: DemoDevice, now: Date, day: string = ctx.today) {
  const value = valueFor(machine.assetCode, day);
  const tools = (machine.tools ?? []).map((tool, index) => {
    const unobservable = machine.assetCode === 'SV-LT-003' && tool === 'CODEX';
    return {
      tool,
      coverage: unobservable ? 'NOT_OBSERVABLE' : 'PARTIAL',
      responses: unobservable ? 0 : value + index * 7,
      totalTokens: unobservable ? 0 : (value + index * 7) * 1200,
    };
  });
  return { generatedAt: now.toISOString(), days: [{ date: day, tools }] };
}

export function statusSnapshotsBody(ctx: DemoRunContext, machine: DemoDevice, now: Date) {
  const usedPercent = valueFor(machine.assetCode, ctx.today);
  return {
    snapshots: (machine.tools ?? []).map((tool) => ({
      tool,
      observedAt: now.toISOString(),
      auth: { status: 'LOGGED_IN' },
      quota: {
        status: 'OK',
        windows: (tool === 'CLAUDE_CODE' ? ['SESSION', 'WEEKLY_ALL'] : ['PRIMARY', 'SECONDARY']).map((code) => ({
          code,
          usedPercent,
          resetsAt: null,
        })),
      },
    })),
  };
}

function accepted(results: { outcome: string }[]): boolean {
  return results.length > 0 && results.every(({ outcome }) => outcome === 'ACCEPTED' || outcome === 'UNCHANGED');
}

async function sendBatch(ctx: DemoRunContext, spec: DemoDevice, token: string): Promise<StepOutcome> {
  const session = await ctx.api.callAsDevice<{ state: string; timezone: string }>(token, 'GET', '/device-session');
  if (session.state !== 'ACTIVE') return { status: 'conflict', detail: 'Device session is not ACTIVE' };
  const now = new Date();
  const usage = await ctx.api.callAsDevice<{ results: { outcome: string }[] }>(
    token,
    'POST',
    '/ai-usage-batches',
    usageBatchBody(ctx, spec, now, businessDateAt(now, session.timezone)),
  );
  if (!accepted(usage.results)) return { status: 'conflict', detail: 'Usage batch was not fully accepted' };
  const status = await ctx.api.callAsDevice<{ results: { outcome: string }[] }>(
    token,
    'POST',
    '/ai-tool-status-snapshots',
    statusSnapshotsBody(ctx, spec, now),
  );
  if (!accepted(status.results)) return { status: 'conflict', detail: 'Tool status was not fully accepted' };
  return { status: 'done' };
}

async function collectOne(ctx: DemoRunContext, spec: DemoDevice) {
  const email = await deviceAdmin(ctx, spec);
  const device = await findDevice(ctx, email, spec.assetCode);
  if (!device) return { status: 'conflict' as const, label: `${spec.assetCode}: no machine` };
  if (device.state === 'COLLECTION_STOPPED')
    return { status: 'present' as const, label: `${spec.assetCode}: usage only on D0` };
  if (!machinesToCollect([device]).length || !device.registrationId)
    return { status: 'conflict' as const, label: `${spec.assetCode}: not ACTIVE` };
  const usage = await listAll<{ date: string; tool: string }>(ctx, email, `/devices/${device.id}/usage`);
  const hasToday = (spec.tools ?? []).every((tool) => usage.some((row) => row.date === ctx.today && row.tool === tool));
  if (hasToday) return { status: 'present' as const, label: spec.assetCode };
  if (ctx.mode === 'plan') return { status: 'planned' as const, label: spec.assetCode };
  const { code } = await ctx.api.call<{ code: string }>(
    email,
    'POST',
    `/device-registrations/${device.registrationId}/enrollment-codes`,
    { collectorKind: 'AI_COLLECTOR' },
  );
  const { token } = await ctx.api.callPublic<{ token: string }>(
    'POST',
    '/device-enrollments',
    { enrollmentCode: code },
    { 'Idempotency-Key': installKey() },
  );
  const outcome = await sendBatch(ctx, spec, token);
  return { status: outcome.status, label: `${spec.assetCode}${outcome.detail ? `: ${outcome.detail}` : ''}` };
}

async function collector(ctx: DemoRunContext): Promise<StepOutcome> {
  const results = [];
  for (const spec of ctx.fixture.devices.filter((row) => row.tools?.length)) results.push(await collectOne(ctx, spec));
  return summarize(results);
}

export const COLLECTOR_STEPS: readonly DemoStep[] = [
  {
    key: 'devices.collector',
    title: 'Ba máy gửi usage AI và trạng thái công cụ mô phỏng hôm nay',
    needs: ['devices.registry', 'devices.allowlist', 'devices.acknowledgements'],
    run: collector,
  },
];
