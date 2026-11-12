import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { ApiAccount } from './api-accounts';
import { DeviceEnrollmentController } from '../../src/modules/devices/credential/enrollment/device-enrollment.controller';
import { declareApplication } from './builders/catalog.builder';
import { DocumentHarness, PDF } from './document-harness';

export interface DeviceWire {
  id: string;
  assetCode: string;
  hostname: string;
  os: string;
  holder: { id: string; employeeCode: string; fullName: string } | null;
  registrationId: string | null;
  registeredFrom: string | null;
  state: 'RETIRED' | 'UNREGISTERED' | 'COLLECTION_STOPPED' | 'ACTIVE' | 'AWAITING_ACKNOWLEDGEMENT';
  signatureRecorded: boolean;
  retiredAt: string | null;
  acknowledgedFrom?: string | null;
  latestAcknowledgement?: { noticeVersionNumber: number; acknowledgedAt: string } | null;
  latestSignatureRecord?: { id: string; documentId: string; noticeVersionNumber: number; recordedAt: string } | null;
  lastEnd?: {
    holder: { id: string };
    validUntil: string;
    endedAt: string;
    endCause: string;
  } | null;
  retirementReason?: string | null;
}

export interface NoticeWire {
  id: string;
  versionNumber: number;
  includesToolStatus: boolean;
  requiresReacknowledgement: boolean;
  publishedAt: string;
}

export interface MyDeviceWire {
  registrationId: string;
  deviceId: string;
  assetCode: string;
  acknowledgementState: 'UNACKNOWLEDGED' | 'ACKNOWLEDGED' | 'STOPPED' | 'ENDED';
  acknowledgedVersionNumber: number | null;
  signatureRecorded: boolean;
  canAcknowledge: boolean;
  blockedReason: string | null;
}

export interface CredentialWire {
  id: string;
  collectorKind: string;
  issuedAt: string;
  expiresAt: string;
  lastAcceptedAt: string | null;
  revokedAt: string | null;
  revocationCause: string | null;
  revocationReason: string | null;
}

export interface SessionWire {
  state: 'ACTIVE' | 'AWAITING_ACKNOWLEDGEMENT' | 'COLLECTION_STOPPED';
  expiresAt: string;
  timezone: string;
  acceptFromAt: string | null;
  acceptUntilAt: string | null;
}

export const NOTICE_TEXT = {
  collected: 'The names of the tools used and their usage totals.',
  notCollected: 'Prompts, answers, code, files, addresses and the content of messages.',
  purpose: 'To see which licenses are used.',
  retention: 'Kept as long as the machine is registered.',
  stopRight: 'The holder may ask to stop at any time.',
};

/** The installation with a storage in memory, plus the calls of the register of company machines, the notice and the holder. */
export class DevicesHarness extends DocumentHarness {
  private assets = 0;

  /**
   * The enrollment route allows ten exchanges a minute from one address, and every case of a file comes from the same one: the
   * limit of the route is lifted for the suite, the global limit having been raised already. The limit itself is read off the route.
   */
  override async start(): Promise<void> {
    await super.start();
    const route = Object.getOwnPropertyDescriptor(DeviceEnrollmentController.prototype, 'create')?.value as object;
    Reflect.defineMetadata('THROTTLER:LIMITdefault', 100_000, route);
  }

  private adminHeader = () => ({ Authorization: `Bearer ${this.admin}` });

  createDevice = (body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post('/api/v1/devices').set(this.as(account)).send(body);
  listDevices = (query = '', account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/devices${query}`).set(this.as(account));
  getDevice = (id: string, account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/devices/${id}`).set(this.as(account));
  changeHolder = (id: string, holderEmployeeId: string, account: ApiAccount = this.it1) =>
    request(this.server())
      .post(`/api/v1/devices/${id}/holder-changes`)
      .set(this.as(account))
      .send({ holderEmployeeId });
  retire = (id: string, reason = 'The disk failed.', account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/devices/${id}/retirements`).set(this.as(account)).send({ reason });
  recordSignature = (registrationId: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server())
      .post(`/api/v1/device-registrations/${registrationId}/signature-records`)
      .set(this.as(account))
      .send(body);
  publishNotice = (body: object) =>
    request(this.server()).post('/api/v1/monitoring-notice-versions').set(this.adminHeader()).send(body);
  currentNotice = (account: ApiAccount = this.employee) =>
    request(this.server()).get('/api/v1/monitoring-notices/current').set(this.as(account));
  myDevices = (account: ApiAccount, query = '') =>
    request(this.server()).get(`/api/v1/me/devices${query}`).set(this.as(account));
  acknowledge = (account: ApiAccount, registrationId: string, noticeVersionId: string) =>
    request(this.server())
      .post(`/api/v1/me/device-registrations/${registrationId}/acknowledgements`)
      .set(this.as(account))
      .send({ noticeVersionId });

  createCode = (registrationId: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server())
      .post(`/api/v1/device-registrations/${registrationId}/enrollment-codes`)
      .set(this.as(account))
      .send(body);
  /** `null` sends no Idempotency-Key at all. */
  enroll = (enrollmentCode: string, key: string | null = `key-${randomUUID()}`) => {
    const call = request(this.server()).post('/api/v1/device-enrollments');

    return (key === null ? call : call.set('Idempotency-Key', key)).send({ enrollmentCode });
  };
  session = (token: string) =>
    request(this.server())
      .get('/api/v1/device-session')
      .set({ Authorization: `Bearer ${token}` });
  rotate = (token: string) =>
    request(this.server())
      .post('/api/v1/device-session/rotations')
      .set({ Authorization: `Bearer ${token}` })
      .send({});
  listCredentials = (registrationId: string, query = '', account: ApiAccount = this.it1) =>
    request(this.server())
      .get(`/api/v1/device-registrations/${registrationId}/credentials${query}`)
      .set(this.as(account));
  revokeCredential = (id: string, reason = 'The tool was reinstalled.', account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/device-credentials/${id}/revocations`).set(this.as(account)).send({ reason });

  allowlistPublish = (body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post('/api/v1/collector-allowlist-versions').set(this.as(account)).send(body);
  allowlistEntries = (query = '', account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/collector-allowlist-entries${query}`).set(this.as(account));
  sendUsage = (token: string, body: object) =>
    request(this.server())
      .post('/api/v1/ai-usage-batches')
      .set({ Authorization: `Bearer ${token}` })
      .send(body);
  sendStatus = (token: string, body: object) =>
    request(this.server())
      .post('/api/v1/ai-tool-status-snapshots')
      .set({ Authorization: `Bearer ${token}` })
      .send(body);
  deviceUsage = (deviceId: string, query = '', account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/devices/${deviceId}/usage${query}`).set(this.as(account));
  deviceStatus = (deviceId: string, query = '', account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/devices/${deviceId}/tool-status${query}`).set(this.as(account));
  deviceRejections = (deviceId: string, query = '', account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/devices/${deviceId}/intake-rejections${query}`).set(this.as(account));
  myUsage = (account: ApiAccount, deviceId: string, query = '') =>
    request(this.server()).get(`/api/v1/me/devices/${deviceId}/usage${query}`).set(this.as(account));
  myStatus = (account: ApiAccount, deviceId: string, query = '') =>
    request(this.server()).get(`/api/v1/me/devices/${deviceId}/tool-status${query}`).set(this.as(account));

  /** An application of the catalog as the IT Admin declares it; `communication` makes it a messaging or meeting service. */
  async catalogApplication(kind: 'SAAS' | 'LICENSED' | 'INTERNAL' = 'SAAS', communication = false): Promise<string> {
    return declareApplication(this.ctx, this.it1.accessToken, {
      name: this.unique('Tool'),
      kind,
      ...(kind === 'INTERNAL' ? {} : { vendorName: this.unique('Vendor') }),
      dataSensitivity: 'LOW',
      communication: { personToPersonMessaging: communication, callsOrMeetings: false, mailbox: false },
    });
  }

  /** The allowlist of the installation says Claude Code and Codex are reported; returns the applications they stand for. */
  async allowlisted(tools: readonly ('CLAUDE_CODE' | 'CODEX' | 'ANTIGRAVITY_CLI')[] = ['CLAUDE_CODE', 'CODEX']) {
    const applications: Record<string, string> = {};
    for (const tool of tools) applications[tool] = await this.catalogApplication();
    await this.allowlistPublish({
      reason: 'The tools the company licenses.',
      aiTools: tools.map((tool) => ({ tool, applicationId: applications[tool] })),
    }).expect(201);

    return applications;
  }

  /** A machine that is collected from: registered, signed, acknowledged, enrolled as an AI collector. */
  async collected(
    holder: ApiAccount,
    notice: NoticeWire,
  ): Promise<{ device: DeviceWire; token: string; credentialId: string }> {
    const device = await this.active(holder, notice);
    const enrolled = await this.enrolled(device.registrationId as string);

    return { device, ...enrolled };
  }

  /** A batch of one day with one PARTIAL count for each tool named. */
  usageBatch(
    date: string,
    generatedAt: Date,
    tools: readonly string[] = ['CODEX'],
    counts = { responses: 3, totalTokens: 900 },
  ) {
    return {
      generatedAt: generatedAt.toISOString(),
      days: [{ date, tools: tools.map((tool) => ({ tool, coverage: 'PARTIAL', ...counts })) }],
    };
  }

  /** A new asset code each call, so cases do not collide. */
  assetCode = (): string => `AS-${String((this.assets += 1)).padStart(4, '0')}`;

  /** A machine registered to `holderEmployeeId`, as the IT Admin does. */
  async registered(holderEmployeeId: string, over: object = {}): Promise<DeviceWire> {
    return this.dataOf<DeviceWire>(
      await this.createDevice({
        assetCode: this.assetCode(),
        hostname: `DES-${this.assets}`,
        os: 'Windows 11',
        holderEmployeeId,
        ...over,
      }).expect(201),
    );
  }

  /** A version of the notice, published by the Super Admin. */
  async published(over: object = {}): Promise<NoticeWire> {
    return this.dataOf<NoticeWire>(
      await this.publishNotice({
        ...NOTICE_TEXT,
        includesToolStatus: false,
        requiresReacknowledgement: false,
        ...over,
      }).expect(201),
    );
  }

  /** The scan of a signed `BM-06`, uploaded by the IT Admin and waiting to be recorded. */
  async scan(account: ApiAccount = this.it1): Promise<string> {
    return (await this.uploaded(account, { ...PDF, purpose: 'SIGNATURE_RECORD' })).id;
  }

  /** The signed record of a registration under a version of the notice: the holder can acknowledge after it. */
  async signed(registrationId: string, noticeVersionId: string): Promise<void> {
    await this.recordSignature(registrationId, { documentId: await this.scan(), noticeVersionId }).expect(201);
  }

  /** A holder with an account who has acknowledged the version in force on a signed machine: the machine is collected from. */
  async active(holder: ApiAccount, notice: NoticeWire): Promise<DeviceWire> {
    const device = await this.registered(holder.employeeId);
    await this.signed(device.registrationId as string, notice.id);
    await this.acknowledge(holder, device.registrationId as string, notice.id).expect(201);

    return this.dataOf<DeviceWire>(await this.getDevice(device.id).expect(200));
  }

  /** A machine registered to the holder with its signed record kept: the IT Admin can make a code for it. */
  async signedMachine(holder: ApiAccount, notice: NoticeWire): Promise<DeviceWire> {
    const device = await this.registered(holder.employeeId);
    await this.signed(device.registrationId as string, notice.id);

    return device;
  }

  /** A code for the registration, as the IT Admin reads it out. */
  async codeFor(registrationId: string, body: object = { collectorKind: 'AI_COLLECTOR' }): Promise<string> {
    return this.dataOf<{ code: string }>(await this.createCode(registrationId, body).expect(201)).code;
  }

  /** A collector that enrolled: its token and the id inside it. */
  async enrolled(
    registrationId: string,
    body: object = { collectorKind: 'AI_COLLECTOR' },
  ): Promise<{ token: string; credentialId: string }> {
    const token = this.dataOf<{ token: string }>(
      await this.enroll(await this.codeFor(registrationId, body)).expect(201),
    ).token;

    return { token, credentialId: token.split('_')[1] };
  }
}
