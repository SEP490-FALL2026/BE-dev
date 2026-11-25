import { as, listAll, person, summarize } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoNewDevice } from '../fixture/demo-fixture.types';
import { bundledPlanIds, storeKeyId } from './devices.steps';

type Result = { status: StepOutcome['status']; label: string };

interface NewDeviceWire {
  id: string;
  assetCode: string;
  serialNumber: string | null;
  condition: string;
}
interface ActivationWire {
  plan: { id: string };
}

/**
 * Who enters a machine bought after the baseline: any IT Admin when it waits in the stock, the one who answers for the department of the person
 * who is handed it otherwise (QĐ-118).
 */
async function enteringAdmin(ctx: DemoRunContext, spec: DemoNewDevice): Promise<string> {
  const department = spec.holder ? person(ctx, spec.holder).department : null;
  const admin = department
    ? ctx.fixture.departments.find(({ code }) => code === department)?.itAdmin
    : ctx.fixture.departments[0]?.itAdmin;
  if (!admin) throw new Error(`No IT Admin to enter ${spec.hostname}`);

  return as(ctx, admin);
}

/** The system gave the machine its code, so a rerun finds it by the name it goes by and then by its serial number. */
async function findNew(ctx: DemoRunContext, email: string, spec: DemoNewDevice): Promise<NewDeviceWire | undefined> {
  const rows = await listAll<NewDeviceWire>(ctx, email, `/devices?search=${encodeURIComponent(spec.hostname)}`);

  return rows.find((row) => row.serialNumber === spec.serialNumber);
}

function newDeviceBody(ctx: DemoRunContext, spec: DemoNewDevice): Record<string, unknown> {
  const holderEmployeeId = spec.holder ? ctx.ids.employees.get(spec.holder) : undefined;
  if (spec.holder && !holderEmployeeId) throw new Error(`No employee for ${spec.hostname}`);

  return {
    deviceType: spec.deviceType,
    hostname: spec.hostname,
    os: 'Windows 11',
    serialNumber: spec.serialNumber,
    bundledPlanIds: bundledPlanIds(ctx, spec.bundled),
    ...(holderEmployeeId ? { holderEmployeeId, collectorInstalled: false } : {}),
  };
}

/** Whether the machine already runs the plan bought per machine. */
async function runsKey(ctx: DemoRunContext, email: string, device: NewDeviceWire, planId: string): Promise<boolean> {
  const rows = await listAll<ActivationWire>(ctx, email, `/device-activations?deviceId=${device.id}&state=ALL`);

  return rows.some((row) => row.plan.id === planId);
}

/** Runs the key of the lot on the machine: nothing to run it with, already running, or written now. */
async function activateKey(
  ctx: DemoRunContext,
  email: string,
  device: NewDeviceWire,
  spec: DemoNewDevice,
): Promise<'missing' | 'present' | 'done'> {
  const lot = ctx.fixture.lots.find(({ key }) => key === spec.keyOf);
  const planId = lot ? ctx.ids.plans.get(lot.plan) : undefined;
  const keyId = spec.keyOf ? await storeKeyId(ctx, spec.keyOf) : null;
  if (!planId || !keyId) return 'missing';
  if (await runsKey(ctx, email, device, planId)) return 'present';
  await ctx.api.call(email, 'POST', `/devices/${device.id}/activations`, { planId, licenseKeyId: keyId });

  return 'done';
}

async function oneNewDevice(ctx: DemoRunContext, spec: DemoNewDevice): Promise<Result> {
  const label = spec.hostname;
  const email = await enteringAdmin(ctx, spec);
  let device = await findNew(ctx, email, spec);
  let wrote = false;
  if (!device) {
    // A plan run reads only: the key and the condition of a machine that is not there yet cannot be told.
    if (ctx.mode === 'plan') return { status: 'planned', label };
    await ctx.api.call(email, 'POST', '/devices', newDeviceBody(ctx, spec));
    device = await findNew(ctx, email, spec);
    if (!device) return { status: 'conflict', label: `${label}: not found after it was entered` };
    wrote = true;
  }
  // The key is run while the machine is usable: a broken machine takes no software.
  if (spec.keyOf) {
    const key = ctx.mode === 'plan' ? 'present' : await activateKey(ctx, email, device, spec);
    if (key === 'missing') return { status: 'conflict', label: `${label}: no key to run` };
    wrote ||= key === 'done';
  }
  if (spec.condition && device.condition !== spec.condition && ctx.mode !== 'plan') {
    await ctx.api.call(email, 'POST', `/devices/${device.id}/condition-changes`, {
      condition: spec.condition,
      note: '[SV] Screen broken, waiting for the vendor',
    });
    wrote = true;
  }

  return { status: wrote ? 'done' : 'present', label };
}

async function newDevices(ctx: DemoRunContext): Promise<StepOutcome> {
  const results: Result[] = [];
  for (const spec of ctx.fixture.newDevices) results.push(await oneNewDevice(ctx, spec));

  return summarize(results);
}

/**
 * The machines bought after the baseline (W2-25): entered with the Windows that comes with them, two waiting in the stock, one running Office and
 * broken, and one handed to each of the two people who leave. It comes before the records of departure so they find the machine to take back.
 */
export const NEW_DEVICE_STEPS: readonly DemoStep[] = [
  {
    key: 'devices.new-machines',
    title: 'Năm máy mới: hai máy trong kho, một máy hỏng còn người giữ, hai máy giao cho hai người sắp nghỉ (IT Admin)',
    needs: ['devices.initial-records', 'assets.keys', 'org.it-admins', 'catalog.plans'],
    run: newDevices,
  },
];
