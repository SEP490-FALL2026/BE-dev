import { DemoApiError } from '../demo-api-client';
import { dayOffset } from '../demo-dates';
import { as, listAll, summarize } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoGhostDecision, DemoUsageSource } from '../fixture/demo-fixture.types';

type Result = { status: StepOutcome['status']; label: string };

const IDENTIFIER_COLUMN = 'email';
const ACTIVITY_COLUMN = 'last_activity_date';

/** The IT Admin who declares the source of an application and imports its reports. */
const importerOf = (ctx: DemoRunContext, spec: DemoUsageSource) => as(ctx, spec.importer);

async function sources(ctx: DemoRunContext): Promise<StepOutcome> {
  const results: Result[] = [];
  for (const spec of ctx.fixture.usageSources) {
    const label = spec.name;
    const admin = await importerOf(ctx, spec);
    const applicationId = ctx.ids.applications.get(spec.application);
    const found = (
      await listAll<{ id: string; name: string }>(ctx, admin, `/usage-sources?applicationId=${applicationId}`)
    ).find((row) => row.name === spec.name);
    if (found) {
      ctx.ids.usageSources.set(spec.key, found.id);
      results.push({ status: 'present', label });
    } else if (ctx.mode === 'plan') results.push({ status: 'planned', label });
    else {
      const created = await ctx.api.call<{ id: string }>(admin, 'POST', '/usage-sources', {
        applicationId,
        name: spec.name,
        identifierType: 'EMAIL',
        reportShape: 'AGGREGATE',
        template: {
          columns: { identifier: IDENTIFIER_COLUMN, lastActivityDate: ACTIVITY_COLUMN },
          dateFormat: 'YYYY-MM-DD',
        },
        timeZone: 'Asia/Ho_Chi_Minh',
        activityDefinition: spec.activityDefinition,
        definitionStrictness: 'STRICT',
        evidenceDirection: 'POSITIVE_AND_NEGATIVE',
        capabilities: { memberList: true, lastActivity: true, eventDetail: false },
      });
      ctx.ids.usageSources.set(spec.key, created.id);
      results.push({ status: 'done', label });
    }
  }

  return summarize(results);
}

/** The report file of the template: one line per person, with the last day of activity (empty for a member with none). */
export function reportOf(ctx: DemoRunContext, spec: DemoUsageSource): string {
  const lines = spec.rows.map(
    (row) =>
      `${row.identifier},${row.lastActivityDaysAgo === null ? '' : dayOffset(ctx.today, -row.lastActivityDaysAgo)}`,
  );

  return [`${IDENTIFIER_COLUMN},${ACTIVITY_COLUMN}`, ...lines].join('\n');
}

interface ImportView {
  id: string;
  sourceId: string;
  status: string;
  previewVersion: number;
  summary: { invalid: number; ambiguous: number; trackingNoticeRequired: boolean };
}

/** Whether a report of the source was confirmed before: found through the Audit Trail of the confirmations, then the import itself. */
async function alreadyImported(ctx: DemoRunContext, admin: string, sourceId: string): Promise<boolean> {
  const events = await listAll<{ resourceId: string }>(
    ctx,
    ctx.superAdminEmail,
    '/audit-events?action=USAGE_IMPORT.CONFIRMED',
  );
  for (const event of events) {
    const view = await ctx.api
      .call<ImportView>(admin, 'GET', `/usage-imports/${event.resourceId}`)
      .catch((error: unknown) => {
        if (error instanceof DemoApiError && (error.status === 403 || error.status === 404)) return null;
        throw error;
      });
    if (view?.sourceId === sourceId) return true;
  }

  return false;
}

async function oneImport(ctx: DemoRunContext, spec: DemoUsageSource): Promise<Result> {
  const label = spec.name;
  const sourceId = ctx.ids.usageSources.get(spec.key);
  const admin = await importerOf(ctx, spec);
  if (!sourceId)
    return ctx.mode === 'plan'
      ? { status: 'planned', label }
      : { status: 'conflict', label: `${label}: chưa có nguồn` };
  if (await alreadyImported(ctx, admin, sourceId)) return { status: 'present', label };
  if (ctx.mode === 'plan') return { status: 'planned', label };
  const preview = await ctx.api.upload<ImportView>(
    admin,
    '/usage-imports',
    { name: `${ctx.fixture.marker}-${spec.key}-usage.csv`, content: reportOf(ctx, spec), type: 'text/csv' },
    {
      sourceId,
      coverageFrom: dayOffset(ctx.today, -spec.windowFromDaysAgo),
      coverageTo: dayOffset(ctx.today, -spec.windowToDaysAgo),
    },
  );
  if (preview.summary.invalid > 0 || preview.summary.ambiguous > 0) {
    return { status: 'conflict', label: `${label}: bản xem trước có dòng không hợp lệ hoặc nhập nhằng` };
  }
  await ctx.api.call(
    admin,
    'POST',
    `/usage-imports/${preview.id}/confirm`,
    {
      previewVersion: preview.previewVersion,
      ...(preview.summary.trackingNoticeRequired ? { notice: spec.notice } : {}),
    },
    { 'Idempotency-Key': `${ctx.fixture.marker}-USAGE-IMPORT-${spec.key.toUpperCase()}-1` },
  );

  return { status: 'done', label };
}

/**
 * Every recommendation raised, read as each IT Admin responsible for a subscription of the dataset: an IT Admin reads the table only for the
 * departments in their scope (`QĐ-111ax`), so one reader no longer sees them all. Deduplicated by id.
 */
async function raisedForAll<T extends { id: string }>(ctx: DemoRunContext): Promise<T[]> {
  const readers = [...new Set(ctx.fixture.subscriptions.map((subscription) => subscription.responsible))];
  const byId = new Map<string, T>();
  for (const reader of readers) {
    for (const item of await listAll<T>(ctx, await as(ctx, reader), '/ghost-seat-recommendations'))
      byId.set(item.id, item);
  }

  return [...byId.values()];
}

async function imports(ctx: DemoRunContext): Promise<StepOutcome> {
  const results: Result[] = [];
  for (const spec of ctx.fixture.usageSources) results.push(await oneImport(ctx, spec));

  return summarize(results);
}

/**
 * The first run of the rules on the data just loaded: the rules otherwise run on a schedule, and the first scheduled pass may come before
 * the data does. Raised recommendations are the proof the rules ran, so a rerun does not run them again.
 */
async function firstRun(ctx: DemoRunContext): Promise<StepOutcome> {
  const admin = await as(ctx, ctx.fixture.subscriptions[0].responsible);
  const raised = await raisedForAll<{ id: string }>(ctx);
  if (raised.length > 0) return { status: 'present', detail: `${raised.length} khuyến nghị đã có` };
  if (ctx.mode === 'plan') return { status: 'planned', detail: 'chạy luật G1–G4' };
  await ctx.api.call(admin, 'POST', '/ghost-seat-rule-runs', {});

  return { status: 'done', detail: 'đã chạy luật G1/G2 và G3/G4' };
}

interface QueueItem {
  id: string;
  holder?: { employeeCode: string } | null;
  application?: { applicationName: string } | null;
  state: string;
}

/** The follow-up job of the heads' queues first runs 6 minutes after the API starts, then hourly: the wait for it is bounded a little above. */
const ROUTING_WAIT_MS = 9 * 60 * 1000;
const ROUTING_POLL_MS = 15_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Where a recommendation of a holder stands: waiting in the queue of their head, or somewhere else (decided, paused, closed), or still
 * unrouted. A recommendation is put in front of the head only by the follow-up job of the queues, never by a request, so a seed that has just
 * started the API waits for that first pass; a rerun finds it already routed or decided and does not wait.
 */
async function standingOf(
  ctx: DemoRunContext,
  head: string,
  wanted: (item: QueueItem) => boolean,
): Promise<{ waiting?: QueueItem; others: QueueItem[] }> {
  const waiting = (await listAll<QueueItem>(ctx, head, '/ghost-seat-queue')).find(
    (item) => wanted(item) && item.state === 'AWAITING_DECISION',
  );
  const raised = (await raisedForAll<QueueItem>(ctx)).filter(wanted);

  return { waiting, others: raised };
}

async function awaitRouting(ctx: DemoRunContext, head: string, wanted: (item: QueueItem) => boolean) {
  const until = Date.now() + ROUTING_WAIT_MS;
  let standing = await standingOf(ctx, head, wanted);
  while (!standing.waiting && standing.others.some((item) => item.state === 'OPEN') && Date.now() < until) {
    await sleep(ROUTING_POLL_MS);
    standing = await standingOf(ctx, head, wanted);
  }

  return standing;
}

/** The head decides the recommendations the fixture lists; the others stay waiting for the demo. */
async function decisions(ctx: DemoRunContext): Promise<StepOutcome> {
  const results: Result[] = [];
  for (const spec of ctx.fixture.ghostDecisions) {
    const label = `${spec.holder} ${spec.choice}`;
    const application = ctx.fixture.applications.find((candidate) => candidate.key === spec.application);
    const head = ctx.fixture.departments.find(
      (department) => department.code === ctx.fixture.people.find((p) => p.code === spec.holder)?.department,
    )?.head;
    if (!application || !head) {
      results.push({ status: 'conflict', label: `${label}: không xác định được ứng dụng hoặc trưởng phòng` });
      continue;
    }
    const email = await as(ctx, head);
    const wanted = (item: QueueItem) =>
      item.holder?.employeeCode === spec.holder && item.application?.applicationName === application.name;
    const standing =
      ctx.mode === 'apply' ? await awaitRouting(ctx, email, wanted) : await standingOf(ctx, email, wanted);
    const outcome = await decideOne(ctx, email, spec, standing);
    results.push({ status: outcome, label });
  }

  return summarize(results);
}

async function decideOne(
  ctx: DemoRunContext,
  email: string,
  spec: DemoGhostDecision,
  standing: { waiting?: QueueItem; others: QueueItem[] },
): Promise<StepOutcome['status']> {
  if (!standing.waiting) {
    if (standing.others.length === 0) return 'conflict';
    // Still unrouted in a plan, or decided and gone from the queue of the head.
    return standing.others.some((item) => item.state === 'OPEN') && ctx.mode === 'plan' ? 'planned' : 'present';
  }
  if (ctx.mode === 'plan') return 'planned';
  await ctx.api.call(email, 'POST', '/ghost-seat-decisions', {
    items: [{ recommendationId: standing.waiting.id }],
    choice: spec.choice,
    reason: spec.reason,
    ...(spec.choice === 'EXEMPT' ? { exemptUntil: dayOffset(ctx.today, spec.exemptDays ?? 90) } : {}),
  });

  return 'done';
}

export const USAGE_STEPS: readonly DemoStep[] = [
  {
    key: 'usage.sources',
    title: 'Nguồn usage của nhà cung cấp (IT Admin phụ trách ứng dụng)',
    needs: ['catalog.baseline-close'],
    run: sources,
  },
  {
    key: 'usage.imports',
    title: 'Nhập báo cáo usage theo mẫu CSV, khớp danh tính (IT Admin)',
    needs: ['usage.sources'],
    run: imports,
  },
  {
    key: 'rules.first-run',
    title: 'Chạy luật G1–G4 trên dữ liệu vừa nạp (IT Admin)',
    needs: ['usage.imports', 'personnel.events'],
    run: firstRun,
  },
  {
    key: 'ghost.decisions',
    title: 'Trưởng phòng Thiết kế quyết một phần khuyến nghị: Giữ, Thu hồi, Miễn trừ, tự quyết',
    needs: ['rules.first-run', 'org.heads'],
    run: decisions,
  },
];
