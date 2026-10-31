import { DemoApiError } from './demo-api-client';
import type { DemoRunContext, StepOutcome } from './demo-run.types';
import type { DemoPerson } from './fixture/demo-fixture.types';

/** A demo account could not sign in with the password the operator gave: it was set by another run with another one. */
export class DemoSignInRefusedError extends Error {
  constructor(readonly employeeCode: string) {
    super(
      `The demo account ${employeeCode} refused the demo password: it exists with another password (set by an earlier run ` +
        'or by hand). Nothing was changed; use the password it was created with.',
    );
    this.name = 'DemoSignInRefusedError';
  }
}

/**
 * A list longer than the command reads: it cannot tell whether what it looks for is there, so the step is reported as
 * a conflict and nothing is written (never a second POST of something that may exist past the last page read).
 */
export class DemoInventoryIncompleteError extends Error {
  constructor(readonly path: string) {
    super(`The list ${path} is longer than the ${MAX_PAGES} pages the command reads: nothing written for this step.`);
    this.name = 'DemoInventoryIncompleteError';
  }
}

/** The pages a list may span before the command gives up looking: the demo data is small, real data may not be. */
export const MAX_PAGES = 50;

interface Page<T> {
  items: T[];
  pagination?: { totalPages: number };
}

export function person(ctx: DemoRunContext, code: string): DemoPerson {
  const found = ctx.fixture.people.find((candidate) => candidate.code === code);
  if (!found) throw new Error(`The fixture names a person it does not declare: ${code}`);

  return found;
}

export function emailOf(ctx: DemoRunContext, code: string): string {
  return `${person(ctx, code).email}@${ctx.fixture.emailDomain}`;
}

/** Signs the demo person in (once per run) and answers their email, the key of `ctx.api.call`. */
export async function as(ctx: DemoRunContext, code: string): Promise<string> {
  const email = emailOf(ctx, code);
  try {
    await ctx.api.signIn(email, ctx.demoPassword);
  } catch (error) {
    if (error instanceof DemoApiError && error.status === 401) throw new DemoSignInRefusedError(code);
    throw error;
  }

  return email;
}

/** Every item of a paged list, asking 100 a page; past `MAX_PAGES` pages it refuses rather than answer a partial list. */
export async function listAll<T>(ctx: DemoRunContext, email: string, path: string): Promise<T[]> {
  const items: T[] = [];
  const join = path.includes('?') ? '&' : '?';
  for (let page = 1; ; page++) {
    const data = await ctx.api.call<Page<T>>(email, 'GET', `${path}${join}page=${page}&pageSize=100`);
    items.push(...data.items);
    if (!data.pagination || page >= data.pagination.totalPages) return items;
    if (page >= MAX_PAGES) throw new DemoInventoryIncompleteError(path);
  }
}

/** A tag written at the start of free text, so a run finds what an earlier run wrote. */
export function tag(ctx: DemoRunContext, key: string): string {
  return `[${ctx.fixture.marker}-${key}]`;
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

/** The year of `today` (the budget year the dataset works in) and its last day. */
export function yearOf(ctx: DemoRunContext): { year: number; lastDay: string } {
  const year = Number(ctx.today.slice(0, 4));

  return { year, lastDay: `${year}-12-31` };
}

/** The basis of every Super Admin write: the fixture's, dated no later than today. */
export function basis(ctx: DemoRunContext): { type: string; reference: string; issuer: string; issuedOn: string } {
  const issuedOn = ctx.fixture.basis.issuedOn <= ctx.today ? ctx.fixture.basis.issuedOn : ctx.today;

  return { ...ctx.fixture.basis, issuedOn };
}

/** The outcome of a step over several items: the first conflict wins, then written, then planned, else present. */
export function summarize(results: readonly { status: StepOutcome['status']; label: string }[]): StepOutcome {
  const named = (status: StepOutcome['status']) =>
    results.filter((result) => result.status === status).map((result) => result.label);
  const conflicts = named('conflict');
  if (conflicts.length) return { status: 'conflict', detail: conflicts.join('; ') };
  const done = named('done');
  if (done.length) return { status: 'done', detail: `đã ghi: ${done.join(', ')}` };
  const planned = named('planned');
  if (planned.length) return { status: 'planned', detail: `sẽ ghi: ${planned.join(', ')}` };

  return { status: 'present', detail: `${results.length} mục đã có` };
}
