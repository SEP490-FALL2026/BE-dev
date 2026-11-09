import type { DemoRunContext } from '../demo-run.types';
import type { DemoBudgetLine } from '../fixture/demo-fixture.types';

/** The one Finance person of the fixture. */
export function financePerson(ctx: DemoRunContext): string {
  return ctx.fixture.people.find((person) => person.account === 'FINANCE')?.code ?? '';
}

export const money = (amount: string) => ({ amount });

/** The proposal body: the order of the lines is their priority rank; a new purchase carries its explanation (`QĐ-94l`). */
export function proposalLines(ctx: DemoRunContext, lines: readonly DemoBudgetLine[]) {
  return lines.map((line, index) => ({
    description: line.description,
    planId: ctx.ids.plans.get(line.plan),
    seats: line.seats,
    amount: money(line.amount),
    lineType: line.lineType,
    priorityRank: index + 1,
    ...(line.zbb ? { zbb: line.zbb } : {}),
    ...(line.note ? { note: line.note } : {}),
  }));
}
