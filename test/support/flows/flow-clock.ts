import { addDays, businessDateAt, type BusinessDate } from '../../../src/core/business-date';
import { addWorkingDays } from '../../../src/core/working-days';

/*
 * The clock of the flows runner (spec e2e-main-flows-suite, section 5). Only `Date` is faked, in this process, so the application
 * (which runs in it) and the test see one "today"; every timer stays real. PostgreSQL keeps its own clock, so rule CR-1 holds: every
 * piece of base data is written on D0, the real day, before the clock jumps; after a jump a scenario only reads, sweeps, signs in
 * and writes what does not reach a trigger that reads `now()`.
 *
 * The triggers that read `now()` for a business day (grep of prisma/migrations, 05/11/2026): `employee_placements_keep_one`
 * (20261103130000), the grant of the Spending Approver and of a head (20261102082906, 20261016190000), the change announcement
 * (20261024140100). A scenario that must write through one of them does it before the jump.
 */

const ZONE = 'Asia/Ho_Chi_Minh';
const NOON = 'T05:00:00.000Z';
/** Everything `jest.useFakeTimers` can fake except `Date`. */
const KEPT_REAL = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
] as const;

export class FlowClockError extends Error {}

/** A service of the application a pass runs, with the instant it is given. */
export type SweepRunner = (now: Date) => Promise<unknown>;

export class FlowClock {
  private installed = false;
  private readonly sweeps = new Map<string, SweepRunner>();

  /**
   * Starts faking `Date` on the real day, D0: at noon (Asia/Ho_Chi_Minh), or at the real instant when that is later, so the fake clock
   * never starts before PostgreSQL's (`now()` of a row written on D0 is never after the "now" of the application).
   */
  start(): void {
    const real = new Date();
    const noon = new Date(businessDateAt(real, ZONE) + NOON);
    jest.useFakeTimers({ doNotFake: [...KEPT_REAL], now: real > noon ? real : noon });
    this.installed = true;
  }

  stop(): void {
    if (this.installed) jest.useRealTimers();
    this.installed = false;
  }

  now(): Date {
    return new Date();
  }

  /** The business day (Asia/Ho_Chi_Minh) the clock stands on. */
  today(): BusinessDate {
    return businessDateAt(this.now(), ZONE);
  }

  inDays(days: number): BusinessDate {
    return addDays(this.today(), days);
  }

  /** Moves to noon of a later day; backwards is refused before anything is called. */
  jumpTo(day: BusinessDate): void {
    if (day < this.today()) throw new FlowClockError(`The clock only moves forward: ${day} is before ${this.today()}.`);
    jest.setSystemTime(new Date(day + NOON));
  }

  jumpDays(days: number): void {
    this.jumpTo(this.inDays(days));
  }

  /** Moves forward by working days of the calendar of a test installation (no day off). */
  jumpWorkingDays(count: number): void {
    this.jumpTo(addWorkingDays(this.today(), count, new Set()));
  }

  /** Names a pass: the world registers each service of the application once. */
  register(name: string, run: SweepRunner): void {
    this.sweeps.set(name, run);
  }

  /** Runs a pass by hand with the clock's `now`; the timer of the application never runs it. */
  async sweep(name: string): Promise<void> {
    const run = this.sweeps.get(name);
    if (!run) throw new FlowClockError(`There is no pass named ${name}.`);
    await run(this.now());
  }
}
