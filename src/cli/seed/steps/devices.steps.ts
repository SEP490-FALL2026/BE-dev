import { DemoApiError } from '../demo-api-client';
import { as, listAll, person, summarize } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoDevice } from '../fixture/demo-fixture.types';
import { uploadDocument } from './file-kit';
import { signaturePdf } from './pdf-builders';

export interface DeviceWire {
  id: string;
  assetCode: string;
  hostname: string;
  os: string;
  holder: { id: string; employeeCode: string } | null;
  registrationId: string | null;
  state: string;
  signatureRecorded: boolean;
}
interface Notice {
  id: string;
  versionNumber: number;
}
export interface MyDevice {
  assetCode: string;
  registrationId: string;
  acknowledgementState: string;
  canAcknowledge: boolean;
  stopRequestPending: boolean;
}
type Result = { status: StepOutcome['status']; label: string };

export function deviceBody(ctx: DemoRunContext, spec: DemoDevice) {
  const holderEmployeeId = ctx.ids.employees.get(spec.holder);
  if (!holderEmployeeId) throw new Error(`No employee for ${spec.assetCode}`);
  return { assetCode: spec.assetCode, hostname: spec.assetCode, os: 'Windows 11', holderEmployeeId };
}

export function signatureRecordBody(documentId: string, noticeVersionId: string) {
  return { documentId, noticeVersionId };
}

export function allowlistBody(ctx: DemoRunContext) {
  return {
    reason: '[SV] Simulated collector: Claude Code and Codex only',
    aiTools: [
      { tool: 'CLAUDE_CODE', applicationId: ctx.ids.applications.get('claude') },
      { tool: 'CODEX', applicationId: ctx.ids.applications.get('chatgpt') },
    ],
  };
}

/** The IT Admin assigned to the holder's department performs registry and collector operations. */
export async function deviceAdmin(ctx: DemoRunContext, spec: DemoDevice): Promise<string> {
  const department = person(ctx, spec.holder).department;
  const admin = ctx.fixture.departments.find(({ code }) => code === department)?.itAdmin;
  if (!admin) throw new Error(`No IT Admin for ${spec.assetCode}`);
  return as(ctx, admin);
}

export async function findDevice(ctx: DemoRunContext, email: string, assetCode: string) {
  const rows = await listAll<DeviceWire>(ctx, email, `/devices?search=${encodeURIComponent(assetCode)}`);
  return rows.find((row) => row.assetCode === assetCode);
}

/** This route permits only 50 rows per page; fail closed if the holder has a longer inventory. */
export async function myDevices(ctx: DemoRunContext, email: string): Promise<MyDevice[]> {
  const data = await ctx.api.call<{ items: MyDevice[]; pagination: { totalPages: number } }>(
    email,
    'GET',
    '/me/devices?page=1&pageSize=50',
  );
  if (data.pagination.totalPages > 1) throw new Error('The holder has more devices than this seed reads');
  return data.items;
}

async function notice(ctx: DemoRunContext): Promise<StepOutcome> {
  try {
    await ctx.api.call(ctx.superAdminEmail, 'GET', '/monitoring-notices/current');
    return { status: 'present' };
  } catch (error) {
    if (!(error instanceof DemoApiError) || error.status !== 404) throw error;
  }
  if (ctx.mode === 'plan') return { status: 'planned' };
  await ctx.api.call(ctx.superAdminEmail, 'POST', '/monitoring-notice-versions', ctx.fixture.monitoringNotice);
  return { status: 'done' };
}

async function allowlist(ctx: DemoRunContext): Promise<StepOutcome> {
  const email = await as(ctx, 'NV-ITA1');
  const rows = await listAll<{ key: string; application: { id: string } }>(ctx, email, '/collector-allowlist-entries');
  const body = allowlistBody(ctx);
  if (body.aiTools.some(({ applicationId }) => !applicationId))
    return { status: 'conflict', detail: 'Missing tool applications' };
  const matches =
    rows.length === body.aiTools.length &&
    body.aiTools.every(({ tool, applicationId }) =>
      rows.some((row) => row.key === tool && row.application.id === applicationId),
    );
  if (matches) return { status: 'present' };
  if (rows.length) return { status: 'conflict', detail: 'The collector allowlist differs from the fixture' };
  if (ctx.mode === 'plan') return { status: 'planned' };
  await ctx.api.call(email, 'POST', '/collector-allowlist-versions', body);
  return { status: 'done' };
}

async function recordSignature(ctx: DemoRunContext, email: string, spec: DemoDevice, device: DeviceWire) {
  const current = await ctx.api.call<Notice>(ctx.superAdminEmail, 'GET', '/monitoring-notices/current');
  const file = await signaturePdf({
    assetCode: spec.assetCode,
    holder: person(ctx, spec.holder).fullName,
    noticeVersion: String(current.versionNumber),
    signedOn: ctx.today,
  });
  const documentId = await uploadDocument(ctx, email, 'SIGNATURE_RECORD', file);
  await ctx.api.call(
    email,
    'POST',
    `/device-registrations/${device.registrationId}/signature-records`,
    signatureRecordBody(documentId, current.id),
  );
}

function registryProblem(spec: DemoDevice, device: DeviceWire): string | null {
  if (device.hostname !== spec.assetCode || device.os !== 'Windows 11') return 'Machine identity differs';
  if (spec.retire && device.state === 'RETIRED') return null;
  if (device.holder?.employeeCode !== spec.holder && device.holder?.employeeCode !== spec.changeTo)
    return 'Holder differs';
  if (!device.registrationId) return 'No open registration';
  return null;
}

function needsRegistryWrite(spec: DemoDevice, device: DeviceWire | undefined) {
  return (
    !device ||
    (spec.signature && !device.signatureRecorded) ||
    (spec.changeTo && device.holder?.employeeCode !== spec.changeTo) ||
    (spec.retire && device.state !== 'RETIRED')
  );
}

async function writeRegistry(
  ctx: DemoRunContext,
  email: string,
  spec: DemoDevice,
  device: DeviceWire,
): Promise<Result> {
  if (spec.signature && !device.signatureRecorded) await recordSignature(ctx, email, spec, device);
  if (spec.changeTo && device.holder?.employeeCode !== spec.changeTo) {
    const holderEmployeeId = ctx.ids.employees.get(spec.changeTo);
    if (!holderEmployeeId) return { status: 'conflict', label: `${spec.assetCode}: new holder absent` };
    await ctx.api.call(email, 'POST', `/devices/${device.id}/holder-changes`, { holderEmployeeId });
  }
  if (spec.retire && device.state !== 'RETIRED')
    await ctx.api.call(email, 'POST', `/devices/${device.id}/retirements`, { reason: '[SV] Demo machine retired' });
  return { status: 'done', label: spec.assetCode };
}

async function oneDevice(ctx: DemoRunContext, spec: DemoDevice): Promise<Result> {
  const email = await deviceAdmin(ctx, spec);
  let device = await findDevice(ctx, email, spec.assetCode);
  const problem = device && registryProblem(spec, device);
  if (problem) return { status: 'conflict', label: `${spec.assetCode}: ${problem}` };
  if (!needsRegistryWrite(spec, device)) return { status: 'present', label: spec.assetCode };
  if (ctx.mode === 'plan') return { status: 'planned', label: spec.assetCode };
  device ??= await ctx.api.call<DeviceWire>(email, 'POST', '/devices', deviceBody(ctx, spec));
  return writeRegistry(ctx, email, spec, device);
}

async function registry(ctx: DemoRunContext): Promise<StepOutcome> {
  const results: Result[] = [];
  for (const spec of ctx.fixture.devices) results.push(await oneDevice(ctx, spec));
  return summarize(results);
}

async function acknowledge(ctx: DemoRunContext, spec: DemoDevice): Promise<Result> {
  const email = await as(ctx, spec.holder);
  const device = (await myDevices(ctx, email)).find((row) => row.assetCode === spec.assetCode);
  if (!device) return { status: 'conflict', label: `${spec.assetCode}: not held by this account` };
  if (['ACKNOWLEDGED', 'STOPPED'].includes(device.acknowledgementState))
    return { status: 'present', label: spec.assetCode };
  if (!device.canAcknowledge) return { status: 'conflict', label: `${spec.assetCode}: cannot acknowledge` };
  if (ctx.mode === 'plan') return { status: 'planned', label: spec.assetCode };
  const current = await ctx.api.call<Notice>(ctx.superAdminEmail, 'GET', '/monitoring-notices/current');
  await ctx.api.call(email, 'POST', `/me/device-registrations/${device.registrationId}/acknowledgements`, {
    noticeVersionId: current.id,
  });
  return { status: 'done', label: spec.assetCode };
}

async function acknowledgements(ctx: DemoRunContext): Promise<StepOutcome> {
  const results: Result[] = [];
  for (const spec of ctx.fixture.devices.filter((row) => row.acknowledge)) results.push(await acknowledge(ctx, spec));
  return summarize(results);
}

export const DEVICE_STEPS: readonly DemoStep[] = [
  {
    key: 'devices.notice',
    title: 'Thông báo giám sát máy công ty (Super Admin)',
    needs: ['org.accounts'],
    run: notice,
  },
  {
    key: 'devices.allowlist',
    title: 'Hai công cụ AI được phép thu thập (IT Admin)',
    needs: ['devices.notice', 'catalog.applications'],
    run: allowlist,
  },
  {
    key: 'devices.registry',
    title: 'Bảy máy công ty và bản ký BM-06 (IT Admin)',
    needs: ['devices.allowlist', 'org.it-admins'],
    run: registry,
  },
  {
    key: 'devices.acknowledgements',
    title: 'Bốn người giữ máy xác nhận thông báo',
    needs: ['devices.registry', 'devices.allowlist'],
    run: acknowledgements,
  },
];
