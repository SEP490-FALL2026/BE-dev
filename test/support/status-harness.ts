import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { RequestStatusProjectorApi } from '../../src/modules/requests/public/request-status-projector.api';
import {
  RequestStatusProjection,
  type ProjectionResult,
} from '../../src/modules/requests/status/request-status-projector.service';
import type { ApiAccount } from './api-accounts';
import { ReassignmentHarness } from './reassignment-harness';

/** A notice as the database keeps it, with the parameters read back as an object. */
export interface NoticeRow {
  id: string;
  recipient_employee_id: string;
  code: string;
  subject_type: string | null;
  subject_id: string | null;
  params: Record<string, string | number | boolean | null>;
  event_key: string;
  created_at: Date;
  read_at: Date | null;
}

export interface NoticeWire {
  id: string;
  code: string;
  subject: { type: string; id: string } | null;
  params: Record<string, string | number | boolean | null>;
  createdAt: string;
  readAt: string | null;
}

/**
 * The spend harness with what the inbox and its projection need: a pass of the projection run by hand at the moment of the
 * database (the audit events carry the clock of the database, not of the test), the notices read back, and audit events written
 * the way a service writes them for what no route can yet do. No assertion lives here: the specs make them.
 */
export class StatusHarness extends ReassignmentHarness {
  private projection = () => this.ctx.app.get(RequestStatusProjection, { strict: false });
  private projector = () => this.ctx.app.get(RequestStatusProjectorApi, { strict: false });

  /** A connection of its own to the database, for a transaction a test holds open; the test ends it. */
  async openClient(): Promise<Client> {
    const client = new Client({ connectionString: this.ctx.database.url });
    await client.connect();

    return client;
  }

  /** The clock of the database right now: what every audit event of a change that has just committed is older than. */
  async databaseNow(): Promise<Date> {
    return (await this.ctx.sql.query<{ now: Date }>(`SELECT clock_timestamp() AS now`)).rows[0].now;
  }

  /**
   * One pass of the projection that reads everything that has committed so far: the pass is told it is the moment of the database
   * plus the delay it keeps, and two milliseconds more because the column keeps whole milliseconds, rounded: an event of a moment
   * ago may read a millisecond later than the clock it is compared to. A test makes its next change only after this returns.
   *
   * Prisma fills `@default(now())` of an audit event with this process's clock, and on a developer machine the database runs in a
   * VM whose clock can fall behind under load: the moment is the later of the two clocks.
   */
  async project(): Promise<ProjectionResult> {
    const moment = Math.max((await this.databaseNow()).getTime(), Date.now());

    return this.projector().project(new Date(moment + this.projection().delayMs() + 2));
  }

  /** A pass made at the moment given, as the worker makes it (events newer than the delay are not read). */
  projectAt(now: Date): Promise<ProjectionResult> {
    return this.projector().project(now);
  }

  /** A pass that reads only the events older than `moment`, as a pass made at that moment would. */
  projectUpTo(moment: Date): Promise<ProjectionResult> {
    return this.projector().project(new Date(moment.getTime() + this.projection().delayMs()));
  }

  /** Every notice of the person, the oldest first. */
  async noticesOf(employeeId: string, code?: string): Promise<NoticeRow[]> {
    const { rows } = await this.ctx.sql.query<NoticeRow>(
      `SELECT id, recipient_employee_id, code, subject_type, subject_id::text, params, event_key, created_at, read_at
         FROM in_app_notifications
        WHERE recipient_employee_id = $1 AND ($2::text IS NULL OR code = $2)
        ORDER BY created_at, id`,
      [employeeId, code ?? null],
    );

    return rows;
  }

  /** The notices about a request (or a return), whoever they were for. */
  async noticesAbout(subjectId: string): Promise<NoticeRow[]> {
    const { rows } = await this.ctx.sql.query<NoticeRow>(
      `SELECT id, recipient_employee_id, code, subject_type, subject_id::text, params, event_key, created_at, read_at
         FROM in_app_notifications WHERE subject_id = $1 ORDER BY created_at, code, recipient_employee_id`,
      [subjectId],
    );

    return rows;
  }

  async noticeCount(): Promise<number> {
    return this.count('in_app_notifications');
  }

  /** The codes a person was told about a request, in the order they were made. */
  async codesFor(employeeId: string, subjectId: string): Promise<string[]> {
    return (await this.noticesOf(employeeId)).filter((row) => row.subject_id === subjectId).map((row) => row.code);
  }

  /** An audit event of the system, as a service writes it in its transaction (`occurred_at` is the start of the statement's transaction). */
  async writeAudit(
    action: string,
    resourceType: string,
    resourceId: string,
    after: Record<string, unknown>,
    options: {
      actorAppUserId?: string | null;
      client?: { query: (text: string, values: unknown[]) => Promise<unknown> };
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    const db = options.client ?? this.ctx.sql;
    await db.query(
      `INSERT INTO audit_events (id, organization_id, actor_kind, actor_app_user_id, actor_roles, action, resource_type, resource_id, after, correlation_id)
       VALUES ($1, $2, $3::"AuditActorKind", $4, '{}', $5, $6, $7, $8::jsonb, $9)`,
      [
        id,
        this.seed.organizationId,
        options.actorAppUserId ? 'USER' : 'SYSTEM',
        options.actorAppUserId ?? null,
        action,
        resourceType,
        resourceId,
        JSON.stringify(after),
        id,
      ],
    );

    return id;
  }

  /** The notices of the inbox of the account over HTTP. */
  inbox = (account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(this.server()).get('/api/v1/notifications').query(query).set(this.as(account));
  unread = (account: ApiAccount) =>
    request(this.server()).get('/api/v1/notifications/unread-count').set(this.as(account));
  markRead = (id: string, account: ApiAccount) =>
    request(this.server()).post(`/api/v1/notifications/${id}/read`).set(this.as(account));
  markAllRead = (account: ApiAccount) =>
    request(this.server()).post('/api/v1/notifications/read-all').set(this.as(account));
  timings = (requestId: string, account: ApiAccount) =>
    request(this.server()).get(`/api/v1/access-requests/${requestId}/timings`).set(this.as(account));
}
