import { RequestStatusProjection } from '../../../src/modules/requests/status/request-status-projector.service';
import { ExpiryReminderService } from '../../../src/modules/licensing/expiry/expiry-reminder.service';
import { businessDateAt } from '../../../src/core/business-date';
import { OrganizationChangeService } from '../../../src/modules/organization/change-announcement/organization-change.service';
import { SubscriptionRenewalSweepService } from '../../../src/modules/licensing/subscription-renewal/subscription-renewal-sweep.service';
import { RequestStatusProjectorApi } from '../../../src/modules/requests/public/request-status-projector.api';
import { StepSlaSweepApi } from '../../../src/modules/requests/public/step-sla-sweep.api';
import { TransferReviewOverdueService } from '../../../src/modules/personnel/transfer-review/transfer-review-overdue.service';
import { OBJECT_STORAGE } from '../../../src/infrastructure/object-storage/object-storage.port';
import { dropDisposableDatabase } from '../disposable-database';
import type { DisposableDatabase } from '../disposable-database';
import { FakeObjectStorage } from '../fake-object-storage';
import { createHttpTestApp, type HttpTestApp } from '../http-test-app';
import { FlowActors } from './flow-actors';
import { FlowCalls } from './flow-calls';
import { FlowClock } from './flow-clock';
import { FlowFacts } from './flow-facts';
import { cloneSeededTemplate, SWEEPER_OVERRIDES } from './flow-template';

/**
 * One file of the flows runner: a copy of the seeded template, the application on it with every timer off, the clock of the file
 * (D0 = the real day), the people who sign in, the facts the scenarios read and the calls they make. Nothing here asserts.
 */
export class FlowWorld {
  private constructor(
    readonly ctx: HttpTestApp,
    private readonly database: DisposableDatabase,
    readonly clock: FlowClock,
    /** The bytes of a file are the one thing outside the BE that is replaced: a declared file is "put" here, as the browser would put it. */
    readonly storage: FakeObjectStorage,
  ) {
    this.actors = new FlowActors(ctx.app);
    this.facts = new FlowFacts(ctx.sql);
    this.calls = new FlowCalls(ctx.app, this.actors, this.facts, this.clock);
  }

  readonly actors: FlowActors;
  readonly facts: FlowFacts;
  readonly calls: FlowCalls;

  /** Copies the seeded template, starts the clock at D0 and the application on the copy. */
  static async open(): Promise<FlowWorld> {
    const database = await cloneSeededTemplate();
    const clock = new FlowClock();
    const storage = new FakeObjectStorage();
    try {
      clock.start();
      const ctx = await createHttpTestApp({
        database,
        providerOverrides: [...SWEEPER_OVERRIDES, { token: OBJECT_STORAGE, useValue: storage }],
      });
      const world = new FlowWorld(ctx, database, clock, storage);
      world.registerPasses();

      return world;
    } catch (error) {
      // The copy of the template belongs to no world yet: it is dropped here, not left for the teardown of the run to find.
      clock.stop();
      await dropDisposableDatabase(database);
      throw error;
    }
  }

  async close(): Promise<void> {
    this.clock.stop();
    await this.ctx.close();
    await dropDisposableDatabase(this.database);
  }

  /** The passes the application runs on a timer, each as a call of its service with the instant of the clock. */
  private registerPasses(): void {
    const app = this.ctx.app;
    const get = <T>(token: new (...args: never[]) => T): T => app.get(token, { strict: false });
    this.clock.register('projection', (now) => {
      const delay = get(RequestStatusProjection).delayMs();

      return get(RequestStatusProjectorApi).project(new Date(now.getTime() + delay + 2));
    });
    this.clock.register('sla', (now) => get(StepSlaSweepApi).sweep(now));
    this.clock.register('expiry', (now) => get(ExpiryReminderService).noticeDue(now));
    this.clock.register('renewal', (now) => get(SubscriptionRenewalSweepService).sweep(now));
    this.clock.register('organizationChange', (now) =>
      get(OrganizationChangeService).announceDue(businessDateAt(now, 'Asia/Ho_Chi_Minh')),
    );
    this.clock.register('transferReview', (now) => get(TransferReviewOverdueService).noticeOverdue(now));
  }
}
