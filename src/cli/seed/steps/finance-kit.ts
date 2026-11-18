import type { DemoRunContext } from '../demo-run.types';

/** The one Finance person of the fixture. */
export function financePerson(ctx: DemoRunContext): string {
  return ctx.fixture.people.find((person) => person.account === 'FINANCE')?.code ?? '';
}

export const money = (amount: string) => ({ amount });
