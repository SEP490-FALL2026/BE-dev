import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { ApiAccount } from './api-accounts';
import { pretendBusinessToday } from './pretend-today';
import { declareApplication, declarePlan, declareSubscription } from './builders/catalog.builder';
import { SeatHarness } from './seat-baseline-harness';

const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

export interface SourceWire {
  id: string;
  application: { id: string; name: string };
  name: string;
  detectableGroups: string[];
  limitation: string | null;
  canConcludeAbsence: boolean;
}

export interface UsageImportWire {
  id: string;
  sourceId: string;
  status: string;
  previewVersion: number;
  summary: {
    window: { from: string; to: string; basis: string };
    totalRows: number;
    matched: number;
    unmatched: number;
    ambiguous: number;
    notAPerson: number;
    invalid: number;
    byCode: Record<string, number>;
    affectedSeats: number;
    detectableGroups: string[];
    activityDefinition: string;
    warnings: string[];
    unmappedEventTypes: string[];
    trackingNoticeRequired: boolean;
  };
  result: Record<string, number> | null;
  noticeMode: string | null;
}

export interface UsageRowWire {
  lineNumber: number;
  identifier: string;
  outcome: string;
  matchMethod: string | null;
  errors: Array<{ code: string; detail?: string }>;
  days: Array<{ date: string; eventClass: string | null; basis: string }>;
}

/** The aggregate source of a vendor that tells the last activity: one `email` column and one `last_active` column. */
export const AGGREGATE_SOURCE = {
  identifierType: 'EMAIL',
  reportShape: 'AGGREGATE',
  template: { columns: { identifier: 'email', lastActivityDate: 'last_active' }, eventClasses: {} },
  capabilities: { memberList: true, lastActivity: true, eventDetail: false },
};

/** The event source: one line for each event, with a table that sorts the types. */
export const EVENT_SOURCE = {
  identifierType: 'EMAIL',
  reportShape: 'EVENT',
  template: {
    columns: { identifier: 'email', date: 'day', eventType: 'event' },
    eventClasses: { open: 'VALUE', view: 'PASSIVE', login: 'AUTH_ONLY', ping: 'IGNORED' },
  },
  capabilities: { memberList: true, lastActivity: true, eventDetail: true },
};

/** The seat harness with the sources and the reports of vendor usage (`SBF-04a`) a suite needs. */
export class UsageHarness extends SeatHarness {
  private machines = 0;

  /** An application of the catalog with a plan and a subscription of 100 seats; `communication` makes it a messaging service. */
  async usageApp(options: { communication?: boolean; kind?: 'SAAS' | 'INTERNAL' } = {}) {
    const kind = options.kind ?? 'SAAS';
    const applicationId = await declareApplication(this.ctx, this.it1.accessToken, {
      name: this.unique('UsageApp'),
      kind,
      ...(kind === 'INTERNAL' ? {} : { vendorName: this.unique('Vendor') }),
      dataSensitivity: 'LOW',
      communication: options.communication ? { ...NO, personToPersonMessaging: true } : NO,
    });
    if (kind === 'INTERNAL') return { applicationId, planId: null, subscriptionId: null };
    const planId = await declarePlan(this.ctx, this.it1.accessToken, {
      applicationId,
      name: this.unique('Plan'),
      provisioningType: 'K2',
      pricingModel: 'PER_SEAT',
      controlLevel: 'FULL',
    });
    const subscriptionId = await declareSubscription(this.ctx, this.it1.accessToken, {
      ownerDepartmentId: this.seed.departmentId,
      planId,
      kind: 'TERM',
      unitPrice: { amount: '1000000', currency: 'VND' },
      billingCycle: 'MONTHLY',
      startDate: '2026-01-05',
      purchasedQuantity: 100,
    });

    return { applicationId, planId, subscriptionId };
  }

  sourceBody(applicationId: string, extra: Record<string, unknown> = {}) {
    return {
      applicationId,
      name: this.unique('Source'),
      timeZone: 'Asia/Ho_Chi_Minh',
      activityDefinition: 'mở hoặc chỉnh sửa một tệp trong ứng dụng',
      ...AGGREGATE_SOURCE,
      ...extra,
    };
  }

  createSource(body: object, account: ApiAccount = this.it1) {
    return request(this.server()).post('/api/v1/usage-sources').set(this.as(account)).send(body);
  }

  async source(applicationId: string, extra: Record<string, unknown> = {}): Promise<SourceWire> {
    return this.dataOf<SourceWire>(await this.createSource(this.sourceBody(applicationId, extra)).expect(201));
  }

  /** A CSV report: the header and the lines as the vendor sends them. */
  report(header: string[], lines: string[][]): Buffer {
    return this.csv(header, lines);
  }

  uploadReport(
    sourceId: string,
    bytes: Buffer | null,
    fields: { coverageFrom?: string; coverageTo?: string } = {},
    account: ApiAccount = this.it1,
    fileName = 'report.csv',
  ) {
    let call = request(this.server()).post('/api/v1/usage-imports').set(this.as(account)).field('sourceId', sourceId);
    if (fields.coverageFrom) call = call.field('coverageFrom', fields.coverageFrom);
    if (fields.coverageTo) call = call.field('coverageTo', fields.coverageTo);
    if (bytes) call = call.attach('file', bytes, fileName);

    return call;
  }

  async previewReport(
    sourceId: string,
    bytes: Buffer,
    fields: { coverageFrom?: string; coverageTo?: string } = {},
  ): Promise<UsageImportWire> {
    return this.dataOf<UsageImportWire>(await this.uploadReport(sourceId, bytes, fields).expect(201));
  }

  usageRows(importId: string, query: Record<string, string | number> = {}, account: ApiAccount = this.it1) {
    return request(this.server())
      .get(`/api/v1/usage-imports/${importId}/rows`)
      .query({ pageSize: 100, ...query })
      .set(this.as(account));
  }

  async rowsOf(importId: string, query: Record<string, string | number> = {}): Promise<UsageRowWire[]> {
    return this.dataOf<{ items: UsageRowWire[] }>(await this.usageRows(importId, query).expect(200)).items;
  }

  /** The seats of some people on the subscription of an application, written as a baseline (the way seats exist without a request). */
  async seatsOn(
    subscriptionId: string,
    people: Array<{ code: string; account?: string; grantedOn?: string }>,
  ): Promise<void> {
    for (const person of people) await this.person(person.code);
    await this.written(
      { subscriptionId },
      people.map((person) => ({
        employee_code: person.code,
        account_identifier: person.account ?? `${person.code.toLowerCase()}@acme.vn`,
        ...(person.grantedOn ? { granted_on: person.grantedOn } : {}),
      })),
    );
  }

  /** A machine held by the person: its registration, as the IT Admin registers it. */
  async registrationOf(
    employeeId: string,
    today = '2026-09-02',
  ): Promise<{ deviceId: string; registrationId: string }> {
    this.machines += 1;
    // The machine was already in the hands of its holder before the days a test sends: it is registered on an earlier day.
    const spy = pretendBusinessToday(this.ctx.app, '2026-01-05');
    const response = await request(this.server())
      .post('/api/v1/devices')
      .set(this.as(this.it1))
      .send({
        assetCode: `UE-${this.machines}-${randomUUID().slice(0, 6)}`,
        hostname: `UE-${this.machines}`,
        os: 'Windows 11',
        holderEmployeeId: employeeId,
      })
      .expect(201);
    spy.mockResolvedValue(today);
    const device = this.dataOf<{ id: string; registrationId: string }>(response);

    return { deviceId: device.id, registrationId: device.registrationId };
  }

  /** Days a collector sent of an AI tool on a machine (`ai_usage_days`), the way the intake writes them. */
  async collectorUsage(
    machine: { deviceId: string; registrationId: string },
    applicationId: string,
    days: Array<{ date: string; responses: number; coverage?: 'COVERED' | 'PARTIAL' | 'NOT_OBSERVABLE' }>,
  ): Promise<void> {
    for (const day of days) {
      await this.ctx.sql.query(
        `INSERT INTO ai_usage_days (id, organization_id, device_id, registration_id, credential_id, tool, application_id, usage_date, coverage,
           responses, total_tokens, generated_at, content_hash)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'CODEX', $5, $6::date, $7::"UsageCoverage", $8, $9, now(), 'h')`,
        [
          this.seed.organizationId,
          machine.deviceId,
          machine.registrationId,
          randomUUID(),
          applicationId,
          day.date,
          day.coverage ?? 'PARTIAL',
          day.coverage === 'NOT_OBSERVABLE' ? 0 : day.responses,
          day.coverage === 'NOT_OBSERVABLE' ? 0 : 900,
        ],
      );
    }
  }

  /** The confirmation of a preview, with the `Idempotency-Key` the route asks for. */
  confirmReport(
    importId: string,
    previewVersion: number,
    options: { key?: string; notice?: 'CONFIRMED_DELIVERED' | 'SYSTEM_SENT' } = {},
    account: ApiAccount = this.it1,
  ) {
    return request(this.server())
      .post(`/api/v1/usage-imports/${importId}/confirm`)
      .set(this.as(account))
      .set('Idempotency-Key', options.key ?? randomUUID())
      .send({ previewVersion, ...(options.notice ? { notice: options.notice } : {}) });
  }

  /** Previews a report and confirms it (the first report of an application is told to its holders by the system). */
  async confirmed(
    sourceId: string,
    bytes: Buffer,
    fields: { coverageFrom?: string; coverageTo?: string } = {},
  ): Promise<{ preview: UsageImportWire; import: UsageImportWire }> {
    const preview = await this.previewReport(sourceId, bytes, fields);
    const response = await this.confirmReport(preview.id, preview.previewVersion, { notice: 'SYSTEM_SENT' }).expect(
      200,
    );

    return { preview, import: this.dataOf<{ import: UsageImportWire }>(response).import };
  }

  /** The notices of the usage tracking a person has. */
  async trackingNoticesOf(employeeId: string): Promise<Array<{ params: Record<string, unknown>; created_at: Date }>> {
    return (
      await this.ctx.sql.query<{ params: Record<string, unknown>; created_at: Date }>(
        `SELECT params, created_at FROM in_app_notifications WHERE recipient_employee_id = $1 AND code = 'USAGE_TRACKING_NOTICE'`,
        [employeeId],
      )
    ).rows;
  }

  async days(
    importId: string,
  ): Promise<Array<{ normalized_identifier: string; activity_date: string; event_class: string }>> {
    return (
      await this.ctx.sql.query<{ normalized_identifier: string; activity_date: string; event_class: string }>(
        `SELECT normalized_identifier, to_char(activity_date, 'YYYY-MM-DD') AS activity_date, event_class::text
           FROM usage_activity_days WHERE import_id = $1 ORDER BY normalized_identifier, activity_date, event_class`,
        [importId],
      )
    ).rows;
  }
}
