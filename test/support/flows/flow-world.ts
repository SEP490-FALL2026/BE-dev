import { DecisionFollowUpService } from '../../../src/modules/optimization/decision/decision-follow-up.service';
import { InternalRulesService } from '../../../src/modules/optimization/internal-rules/internal-rules.service';
import { RequestStatusProjection } from '../../../src/modules/requests/status/request-status-projector.service';
import { ExpiryReminderService } from '../../../src/modules/licensing/expiry/expiry-reminder.service';
import { businessDateAt } from '../../../src/core/business-date';
import { OrganizationChangeService } from '../../../src/modules/organization/change-announcement/organization-change.service';
import { SubscriptionRenewalSweepService } from '../../../src/modules/licensing/subscription-renewal/subscription-renewal-sweep.service';
import { RequestStatusProjectorApi } from '../../../src/modules/requests/public/request-status-projector.api';
import { StepSlaSweepApi } from '../../../src/modules/requests/public/step-sla-sweep.api';
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
      await world.exemptFromRequestLimits();
      world.registerPasses();

      return world;
    } catch (error) {
      // The copy of the template belongs to no world yet: it is dropped here, not left for the teardown of the run to find.
      clock.stop();
      await dropDisposableDatabase(database);
      throw error;
    }
  }

  /**
   * The journeys send requests for people of the dataset who already have one open for the same plan; GH-1 and GH-2 (BR-MF1-01) are
   * judged by their own suite (`request-limits.integration-spec.ts`). The copy of the template marks the requests of the dataset and every
   * new one with an exemption, the one value the count of the limits skips and nothing else reads, as the request harness does.
   */
  private async exemptFromRequestLimits(): Promise<void> {
    await this.ctx.sql.query(`
      CREATE OR REPLACE FUNCTION test_harness_exempt_from_request_limits() RETURNS trigger AS $$
      BEGIN
        IF NEW.limit_exemption IS NULL THEN NEW.limit_exemption := 'TRANSFER_OVERLAP'; END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql`);

    // The function belongs to whoever owns the tables, as every object of the schema does: a reconcile of the database roles run by a
    // suite on the same database (`_serial/database-runtime-role-*`) finds no object owned by the role of the test.
    await this.ctx.sql.query(`DO $$
      DECLARE owner text := (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = to_regclass('access_requests'));
      BEGIN
        IF owner IS NOT NULL AND owner <> current_user THEN
          EXECUTE format('ALTER FUNCTION test_harness_exempt_from_request_limits() OWNER TO %I', owner);
        END IF;
      END $$`);
    // A line that has ended is never changed (trigger of `access_request_lines`), and an ended one counts for no limit anyway.
    const open: Record<string, string> = {
      access_requests: '',
      access_request_lines: ` AND state NOT IN ('NEED_REJECTED', 'SPEND_REJECTED', 'COMPLETED', 'FAILED', 'WITHDRAWN', 'DROPPED')`,
    };
    for (const table of ['access_requests', 'access_request_lines']) {
      await this.ctx.sql.query(
        `UPDATE ${table} SET limit_exemption = 'TRANSFER_OVERLAP' WHERE limit_exemption IS NULL${open[table]}`,
      );
      await this.ctx.sql.query(`CREATE TRIGGER test_harness_exempt_from_request_limits BEFORE INSERT ON ${table}
        FOR EACH ROW EXECUTE FUNCTION test_harness_exempt_from_request_limits()`);
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
    // MF-5: the daily rules of G1/G2 and the follow-up of the queue of the heads (routing, pause, overdue, exemptions).
    this.clock.register('ghostSeatRules', async (now) => {
      await get(InternalRulesService).run(now);
    });
    this.clock.register('ghostSeatQueue', async (now) => {
      await get(DecisionFollowUpService).run(now);
    });
  }
}
