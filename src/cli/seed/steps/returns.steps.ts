import { as, listAll, person, summarize, tag } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoReturn } from '../fixture/demo-fixture.types';
import { departmentOf } from './request-actions';

type Result = { status: StepOutcome['status']; label: string };

interface ReturnRow {
  id: string;
  state: string;
}

interface SeatRow {
  id: string;
  validUntil: string | null;
  cancelledAt: string | null;
  failedAt: string | null;
}

export interface RevocationTaskRow {
  id: string;
  kind: string;
  status: string;
  assignmentId: string | null;
}

/** What a run does about the return of a seat, from what the API already holds for it (C-13). */
export type ReturnMove = 'SEND' | 'COMPLETE' | 'PRESENT' | 'CONFLICT';

/**
 * The next move on a return: send it when the seat has none, complete its revocation when the scenario wants it done and it waits, leave it when it
 * stands where the scenario wants. A return that failed, or that was completed when the scenario wants it left waiting, is somebody's change.
 */
export function returnMove(spec: Pick<DemoReturn, 'complete'>, existing: Pick<ReturnRow, 'state'> | null): ReturnMove {
  if (existing === null) return 'SEND';
  if (existing.state === 'COMPLETED') return spec.complete ? 'PRESENT' : 'CONFLICT';
  if (existing.state === 'AWAITING_REVOCATION') return spec.complete ? 'COMPLETE' : 'PRESENT';

  return 'CONFLICT';
}

/** The body of `POST /return-requests`: the seat and a reason that carries the tag of the return, for the screens that show it. */
export function returnBody(
  ctx: DemoRunContext,
  spec: DemoReturn,
  assignmentId: string,
): { assignmentId: string; reason: string } {
  return { assignmentId, reason: `${tag(ctx, spec.key)} ${spec.reason}` };
}

/** The task that takes the seat away, still to be worked: the one the return opened for that seat. */
export function revocationTaskOf(
  tasks: readonly RevocationTaskRow[],
  assignmentId: string,
): RevocationTaskRow | undefined {
  return tasks.find(
    (task) =>
      task.kind === 'REVOKE' &&
      task.assignmentId === assignmentId &&
      (task.status === 'QUEUED' || task.status === 'IN_PROGRESS'),
  );
}

/** The seat of the holder in the subscription that is still theirs: not ended, not failed, not cancelled. */
export const openSeatOf = (seats: readonly SeatRow[]): SeatRow | undefined =>
  seats.find((seat) => seat.validUntil === null && seat.cancelledAt === null && seat.failedAt === null);

/** The return of a seat as the API holds it, looked for on every seat the holder has had in the subscription (a completed return ended its seat). */
async function existingReturn(
  ctx: DemoRunContext,
  holderEmail: string,
  seats: readonly SeatRow[],
): Promise<{ row: ReturnRow; seatId: string } | null> {
  for (const seat of seats) {
    const rows = await listAll<ReturnRow>(ctx, holderEmail, `/return-requests?assignmentId=${seat.id}`);
    if (rows.length > 0) return { row: rows[0], seatId: seat.id };
  }

  return null;
}

async function completeRevocation(
  ctx: DemoRunContext,
  adminEmail: string,
  spec: DemoReturn,
  assignmentId: string,
): Promise<void> {
  const tasks = await listAll<RevocationTaskRow>(ctx, adminEmail, '/provisioning-tasks?scope=ALL');
  const task = revocationTaskOf(tasks, assignmentId);
  if (!task) throw new Error(`The revocation of the seat of ${spec.key} is neither queued nor in progress`);
  if (task.status === 'QUEUED') await ctx.api.call(adminEmail, 'POST', `/provisioning-tasks/${task.id}/claim`);
  await ctx.api.call(adminEmail, 'POST', `/provisioning-tasks/${task.id}/revocation-completion`, {
    completion: 'ACCOUNT_REMOVED',
    evidence: `${tag(ctx, spec.key)} Đã gỡ tài khoản của người dùng khỏi workspace.`,
  });
}

interface Parties {
  adminEmail: string;
  holderEmail: string;
  seats: SeatRow[];
}

/** Sends the return from the seat the holder still has, then lets IT complete its revocation when the scenario wants it done. */
async function carryOut(
  ctx: DemoRunContext,
  spec: DemoReturn,
  move: 'SEND' | 'COMPLETE',
  parties: Parties,
  existing: { seatId: string } | null,
): Promise<Result> {
  let assignmentId = existing?.seatId ?? '';
  if (move === 'SEND') {
    const seat = openSeatOf(parties.seats);
    if (!seat) return { status: 'conflict', label: `${spec.key}: ${spec.holder} không còn giữ ghế để trả` };
    assignmentId = seat.id;
    await ctx.api.call(parties.holderEmail, 'POST', '/return-requests', returnBody(ctx, spec, seat.id));
  }
  if (spec.complete) await completeRevocation(ctx, parties.adminEmail, spec, assignmentId);

  return { status: 'done', label: spec.key };
}

async function partiesOf(ctx: DemoRunContext, spec: DemoReturn): Promise<Parties | string> {
  const holderId = ctx.ids.employees.get(spec.holder);
  const subscriptionId = ctx.ids.subscriptions.get(spec.subscription);
  if (!holderId || !subscriptionId) return 'chưa có người giữ hoặc thuê bao';
  const unit = departmentOf(ctx, person(ctx, spec.holder).department ?? '');
  if (!unit.itAdmin) return `phòng ${unit.code} không có IT Admin`;
  const adminEmail = await as(ctx, unit.itAdmin);
  const seats = await listAll<SeatRow>(
    ctx,
    adminEmail,
    `/license-assignments?subscriptionId=${subscriptionId}&employeeId=${holderId}`,
  );

  return { adminEmail, holderEmail: await as(ctx, spec.holder), seats };
}

async function oneReturn(ctx: DemoRunContext, spec: DemoReturn): Promise<Result> {
  const parties = await partiesOf(ctx, spec);
  if (typeof parties === 'string') return { status: 'conflict', label: `${spec.key}: ${parties}` };
  const existing = await existingReturn(ctx, parties.holderEmail, parties.seats);
  const move = returnMove(spec, existing?.row ?? null);
  if (move === 'PRESENT') return { status: 'present', label: spec.key };
  if (move === 'CONFLICT') return { status: 'conflict', label: `${spec.key}: hoàn trả đã ở ${existing?.row.state}` };
  if (ctx.mode === 'plan') return { status: 'planned', label: spec.key };

  return carryOut(ctx, spec, move, parties, existing);
}

async function returns(ctx: DemoRunContext): Promise<StepOutcome> {
  const results: Result[] = [];
  for (const spec of ctx.fixture.returns) results.push(await oneReturn(ctx, spec));

  return summarize(results);
}

export const RETURN_STEPS: readonly DemoStep[] = [
  {
    key: 'requests.returns',
    title: 'Hoàn trả ghế: một đã thu hồi xong, một chờ IT (SBF-03a)',
    needs: ['catalog.baseline-close', 'org.it-admins', 'requests.R46'],
    run: returns,
  },
];
