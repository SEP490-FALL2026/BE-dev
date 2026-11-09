import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BusinessDate } from '../../../core/business-date';
import type { EnvironmentVariables } from '../../../infrastructure/config/env-schema';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import type { AuditCursor, AuditEventSlice } from '../../audit/public/audit.types';
import { InvalidInAppNotificationError } from '../../notifications/public/notifications.errors';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { RequestStatusFactsService } from './request-status-facts.service';
import { RequestStatusRecipientsService } from './request-status-recipients.service';
import { PROJECTED_ACTIONS, plan } from './rules/request-status-rules.policy';
import type { PlannedNotification, StatusEvent } from './request-status.types';
import { StatusCursorRepo } from './status-cursor.repo';

/** How many audit events one transaction reads. */
export const BATCH_SIZE = 200;
/** How many full batches one pass goes on to read, so a long backlog is worked off over a few passes and never in one long hold. */
export const MAX_BATCHES_PER_PASS = 5;
/** Added to the longest time a transaction may take: an event is stamped before its transaction commits, so this is how old it must be. */
export const SAFETY_MARGIN_MS = 5000;
/** The largest id: a pass that read everything up to a moment puts the cursor after every event of that moment. */
const LAST_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

export interface ProjectionResult {
  /** True when another pass held the cursor and this one did nothing. */
  busy: boolean;
  batches: number;
  eventsRead: number;
  notified: number;
  /** Events that made nothing because they were malformed or what they were about is gone. */
  skipped: number;
}

/**
 * The projection of the audit events of the requests into the inbox of the people they concern (`US-05-15`): the state of each
 * request is written by the services that decide it, and they have each recorded an audit event for it; this reads those events
 * in order and writes the notices, in the one transaction that also moves the cursor, so a notice is made once however many times
 * a pass looks at an event and a pass that fails writes nothing and is made again. The services that decide a request are not
 * touched, and what they write first (the audit event or the next step) does not matter: who is told is read from what has been
 * committed after the event.
 *
 * It reads only events old enough that no transaction can still commit an older one (the longest a transaction may take, plus a
 * margin): the audit event carries the clock of the process that wrote it when the insert was sent (Prisma fills
 * `@default(now())` on the client), between the start of its transaction and its commit, not the time it committed.
 */
@Injectable()
export class RequestStatusProjection {
  private readonly logger = new Logger(RequestStatusProjection.name);

  constructor(
    private readonly runner: TransactionRunner,
    private readonly cursor: StatusCursorRepo,
    private readonly audit: AuditApi,
    private readonly facts: RequestStatusFactsService,
    private readonly recipients: RequestStatusRecipientsService,
    private readonly notifications: NotificationsApi,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** How old an event has to be before it is read. */
  delayMs(): number {
    return this.config.get('DB_TRANSACTION_TIMEOUT_MS', { infer: true }) + SAFETY_MARGIN_MS;
  }

  async project(now: Date = new Date()): Promise<ProjectionResult> {
    const upTo = new Date(now.getTime() - this.delayMs());
    const result: ProjectionResult = { busy: false, batches: 0, eventsRead: 0, notified: 0, skipped: 0 };

    for (let batch = 0; batch < MAX_BATCHES_PER_PASS; batch += 1) {
      const done = await this.runner.run((tx) => this.projectBatch(tx, now, upTo));
      if (done.busy) {
        result.busy = batch === 0;
        break;
      }
      result.batches += 1;
      result.eventsRead += done.eventsRead;
      result.notified += done.notified;
      result.skipped += done.skipped;
      if (done.eventsRead < BATCH_SIZE) break;
    }

    return result;
  }

  private async projectBatch(
    tx: DbTx,
    now: Date,
    upTo: Date,
  ): Promise<{ busy: boolean; eventsRead: number; notified: number; skipped: number }> {
    const position = await this.cursor.lock(tx);
    if (position === null) return { busy: true, eventsRead: 0, notified: 0, skipped: 0 };

    const slice = await this.audit.readSince(tx, position, { upTo, actions: PROJECTED_ACTIONS, limit: BATCH_SIZE });
    const actors = await this.recipients.actorsOf(
      slice.flatMap((event) => (event.actorAppUserId ? [event.actorAppUserId] : [])),
    );
    const today = await this.recipients.businessToday(now);
    let notified = 0;
    let skipped = 0;
    for (const stored of slice) {
      const planned = await this.plannedFor(tx, stored, actors, today);
      if (planned === null) {
        skipped += 1;
        continue;
      }
      notified += await this.write(tx, stored, planned);
    }

    // A batch that did not fill read everything up to the moment, so the cursor goes there and a later pass does not look again
    // at the events that are not about requests; a full batch moves it to its last event.
    const last = slice[slice.length - 1];
    const next: AuditCursor | null =
      slice.length < BATCH_SIZE
        ? { occurredAt: upTo, id: LAST_ID }
        : last
          ? { occurredAt: last.occurredAt, id: last.id }
          : null;
    if (next !== null && isAfter(next, position)) await this.cursor.advance(tx, next);

    return { busy: false, eventsRead: slice.length, notified, skipped };
  }

  /** The notices of one event with the recipients who still work; null when the event cannot be judged. */
  private async plannedFor(
    tx: DbTx,
    stored: AuditEventSlice,
    actors: Map<string, string>,
    today: BusinessDate,
  ): Promise<PlannedNotification[] | null> {
    const event: StatusEvent = {
      id: stored.id,
      organizationId: stored.organizationId,
      action: stored.action,
      resourceType: stored.resourceType,
      resourceId: stored.resourceId,
      actorEmployeeId: stored.actorAppUserId ? (actors.get(stored.actorAppUserId) ?? null) : null,
      after: stored.after ?? {},
    };
    const loaded = await this.facts.load(tx, event, today);
    if (typeof loaded === 'string') {
      this.logger.warn(`Audit event ${event.id} (${event.action}) made no notice: ${loaded}`);

      return null;
    }
    const planned = plan(event, loaded);
    const working = await this.recipients.stillWorking(planned.map((notice) => notice.recipientEmployeeId));

    return planned.filter((notice) => working.has(notice.recipientEmployeeId));
  }

  private async write(tx: DbTx, stored: AuditEventSlice, planned: PlannedNotification[]): Promise<number> {
    let written = 0;
    for (const notice of planned) {
      try {
        const added = await this.notifications.notifyInApp(tx, {
          organizationId: notice.organizationId,
          recipientEmployeeId: notice.recipientEmployeeId,
          code: notice.code,
          subject: notice.subject,
          params: notice.params,
          eventKey: notice.eventKey,
        });
        if (added) written += 1;
      } catch (error) {
        // The closed table refused the notice: a mistake of the rule, not of the database. The event is skipped and said so, and
        // the pass goes on, so one wrong rule cannot stop everybody's notices; a database error is not caught and undoes the pass.
        if (!(error instanceof InvalidInAppNotificationError)) throw error;
        this.logger.error(
          `Audit event ${stored.id} (${stored.action}) made a notice the inbox refuses: ${error.refusal.reason}`,
        );
      }
    }

    return written;
  }
}

function isAfter(a: AuditCursor, b: AuditCursor): boolean {
  const byTime = a.occurredAt.getTime() - b.occurredAt.getTime();

  return byTime > 0 || (byTime === 0 && a.id > b.id);
}
