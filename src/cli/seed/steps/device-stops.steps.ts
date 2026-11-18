import { as, listAll, summarize } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoDevice } from '../fixture/demo-fixture.types';
import { deviceAdmin, myDevices } from './devices.steps';

interface StopRequest {
  id: string;
  registrationId: string;
  state: string;
}
type Result = { status: StepOutcome['status']; label: string };

async function finishStop(ctx: DemoRunContext, spec: DemoDevice, email: string, request: StopRequest): Promise<Result> {
  if (request.state !== 'OPEN')
    return { status: 'conflict', label: `${spec.assetCode}: stop request ${request.state}` };
  if (spec.stop === 'COMPLETED')
    await ctx.api.call(email, 'POST', `/device-stop-requests/${request.id}/completion`, {});
  return { status: 'done', label: `${spec.assetCode}: ${spec.stop}` };
}

async function oneStop(ctx: DemoRunContext, spec: DemoDevice): Promise<Result> {
  const admin = await deviceAdmin(ctx, spec);
  const open = await listAll<StopRequest>(ctx, admin, '/device-stop-requests?state=OPEN');
  const completed = await listAll<StopRequest>(ctx, admin, '/device-stop-requests?state=COMPLETED');
  const holder = await as(ctx, spec.holder);
  const device = (await myDevices(ctx, holder)).find((row) => row.assetCode === spec.assetCode);
  if (!device) return { status: 'conflict', label: `${spec.assetCode}: not held by this account` };
  if (completed.some((row) => row.registrationId === device.registrationId))
    return { status: 'present', label: spec.assetCode };
  let request = open.find((row) => row.registrationId === device.registrationId);
  if (request && spec.stop === 'OPEN') return { status: 'present', label: spec.assetCode };
  if (device.acknowledgementState === 'STOPPED')
    return { status: 'present', label: `${spec.assetCode}: stopped already` };
  if (!request && device.stopRequestPending)
    return { status: spec.stop === 'OPEN' ? 'present' : 'conflict', label: `${spec.assetCode}: stop pending` };
  if (ctx.mode === 'plan') return { status: 'planned', label: spec.assetCode };
  if (!request) {
    const data = await ctx.api.call<{ stopRequest: StopRequest }>(
      holder,
      'POST',
      `/me/device-registrations/${device.registrationId}/stop-requests`,
      {},
    );
    request = data.stopRequest;
  }
  return finishStop(ctx, spec, admin, request);
}

async function stopRequests(ctx: DemoRunContext): Promise<StepOutcome> {
  const results: Result[] = [];
  for (const spec of ctx.fixture.devices.filter((row) => row.stop)) results.push(await oneStop(ctx, spec));
  return summarize(results);
}

export const STOP_REQUEST_STEPS: readonly DemoStep[] = [
  {
    key: 'devices.stop-requests',
    title: 'Một yêu cầu dừng chờ IT, một đã hoàn tất',
    needs: ['devices.collector'],
    run: stopRequests,
  },
];
