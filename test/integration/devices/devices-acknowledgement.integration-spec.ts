import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { ApiAccount } from '../../support/api-accounts';
import {
  DevicesHarness,
  NOTICE_TEXT,
  type DeviceWire,
  type MyDeviceWire,
  type NoticeWire,
} from '../../support/devices-harness';

const h = new DevicesHarness();

async function sqlState(sql: Client, text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('the notice, the signed BM-06 and the acknowledgement of the holder (integration, real PostgreSQL)', () => {
  let it2: ApiAccount;
  let counter = 0;
  const sql = (): Client => h.ctx.sql;
  /** An employee with an account of their own, who can be the holder of a machine. */
  const holder = async (): Promise<ApiAccount> => {
    counter += 1;
    return h.account(`E-ACK${counter}`, await h.person(`E-ACK${counter}`), 'EMPLOYEE');
  };
  const mine = async (account: ApiAccount): Promise<MyDeviceWire[]> =>
    h.dataOf<{ items: MyDeviceWire[] }>(await h.myDevices(account).expect(200)).items;
  const stateOf = async (id: string): Promise<DeviceWire> => h.dataOf<DeviceWire>(await h.getDevice(id).expect(200));

  beforeAll(async () => {
    await h.start();
    it2 = await h.account('E-IT2', await h.person('E-IT2'), 'IT_ADMIN');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('US-09-03 AC-5: says there is no notice until the Super Admin publishes the first version, then numbers the versions one after another', async () => {
    expect(h.codeOf(await h.currentNotice().expect(404))).toBe('MONITORING_NOTICE.NOT_PUBLISHED');

    const first = await h.published();
    const second = await h.published({ purpose: 'To see which licenses are used and which are not.' });

    expect([first.versionNumber, second.versionNumber]).toEqual([1, 2]);
    expect(h.dataOf<NoticeWire>(await h.currentNotice(h.finance).expect(200))).toMatchObject({
      id: second.id,
      versionNumber: 2,
    });
  });

  it('US-09-03 AC-1, AC-4, AC-10: a holder acknowledges only their own machine, only after BM-06 is kept, and the list says why not', async () => {
    const notice = await h.published();
    const [e1, e2] = [await holder(), await holder()];
    const device = await h.registered(e1.employeeId);
    const registrationId = device.registrationId as string;

    expect(await mine(e1)).toMatchObject([
      {
        registrationId,
        acknowledgementState: 'UNACKNOWLEDGED',
        canAcknowledge: false,
        blockedReason: 'SIGNATURE_RECORD_MISSING',
      },
    ]);
    expect(h.codeOf(await h.acknowledge(e1, registrationId, notice.id).expect(409))).toBe(
      'DEVICE_REGISTRATION.SIGNATURE_RECORD_MISSING',
    );

    await h.signed(registrationId, notice.id);

    expect(await mine(e1)).toMatchObject([{ canAcknowledge: true, blockedReason: null, signatureRecorded: true }]);
    expect(await mine(e2)).toEqual([]);
    expect(h.codeOf(await h.acknowledge(e2, registrationId, notice.id).expect(404))).toBe(
      'DEVICE_REGISTRATION.NOT_FOUND',
    );
    expect(h.codeOf(await h.acknowledge(h.it1, registrationId, notice.id).expect(404))).toBe(
      'DEVICE_REGISTRATION.NOT_FOUND',
    );
    const acknowledged = h.dataOf<{ noticeVersionNumber: number; registrationId: string }>(
      await h.acknowledge(e1, registrationId, notice.id).expect(201),
    );
    expect(acknowledged).toMatchObject({ registrationId, noticeVersionNumber: notice.versionNumber });
    expect(await mine(e1)).toMatchObject([
      {
        acknowledgementState: 'ACKNOWLEDGED',
        acknowledgedVersionNumber: notice.versionNumber,
        canAcknowledge: false,
        blockedReason: 'ALREADY_ACKNOWLEDGED',
      },
    ]);
    expect(await stateOf(device.id)).toMatchObject({
      state: 'ACTIVE',
      signatureRecorded: true,
      latestAcknowledgement: { noticeVersionNumber: notice.versionNumber },
      latestSignatureRecord: { noticeVersionNumber: notice.versionNumber },
    });
    expect(h.codeOf(await h.acknowledge(e1, registrationId, notice.id).expect(409))).toBe(
      'DEVICE_ACKNOWLEDGEMENT.ALREADY_ACKNOWLEDGED',
    );
  });

  it('US-09-03 AC-3, AC-8: a version that only rewords keeps the machines collected; one that asks again makes the holder acknowledge again', async () => {
    const holderAccount = await holder();
    const notice = await h.published();
    const machine = await h.active(holderAccount, notice);

    await h.published({ stopRight: 'The holder may ask to stop collection at any time.' });
    expect((await stateOf(machine.id)).state).toBe('ACTIVE');
    const asking = await h.published({ requiresReacknowledgement: true });

    expect((await stateOf(machine.id)).state).toBe('AWAITING_ACKNOWLEDGEMENT');
    expect(h.codeOf(await h.acknowledge(holderAccount, machine.registrationId as string, notice.id).expect(409))).toBe(
      'DEVICE_ACKNOWLEDGEMENT.NOTICE_NOT_CURRENT',
    );
    await h.acknowledge(holderAccount, machine.registrationId as string, asking.id).expect(201);
    expect((await stateOf(machine.id)).state).toBe('ACTIVE');
  });

  it('US-09-03 AC-11: a version that starts collecting the status of tools must ask for a new acknowledgement', async () => {
    const response = await h
      .publishNotice({ ...NOTICE_TEXT, includesToolStatus: true, requiresReacknowledgement: false })
      .expect(422);

    expect(h.codeOf(response)).toBe('MONITORING_NOTICE.REACKNOWLEDGEMENT_REQUIRED');
    const accepted = await h.published({ includesToolStatus: true, requiresReacknowledgement: true });
    expect(accepted.includesToolStatus).toBe(true);
  });

  it('US-09-03 AC-7, AC-10: the signed record belongs to the holder; Finance cannot open it, the IT Admin can, and it fits nothing else', async () => {
    const notice = await h.published();
    const device = await h.registered((await holder()).employeeId);
    const registrationId = device.registrationId as string;
    const documentId = await h.scan();

    const recorded = h.dataOf<{ registrationId: string; documentId: string; noticeVersionNumber: number }>(
      await h.recordSignature(registrationId, { documentId, noticeVersionId: notice.id }).expect(201),
    );

    expect(recorded).toMatchObject({ registrationId, documentId, noticeVersionNumber: notice.versionNumber });
    expect(h.codeOf(await h.linkDocument(documentId, h.finance).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
    await h.linkDocument(documentId, h.it1).expect(200);
    const owner = await sql().query<{ signer_employee_id: string; contract_id: string | null; status: string }>(
      `SELECT signer_employee_id, contract_id, status FROM document_attachments WHERE id = $1`,
      [documentId],
    );
    expect(owner.rows[0]).toMatchObject({ signer_employee_id: device.holder?.id, contract_id: null, status: 'READY' });
    expect(
      h.codeOf(await h.recordSignature(registrationId, { documentId, noticeVersionId: notice.id }).expect(409)),
    ).toBe('DOCUMENT.ALREADY_ATTACHED');

    const spare = await h.scan();
    const contract = await h.contract();
    expect(h.codeOf(await h.attachDocument(spare, { contractId: contract }).expect(422))).toBe(
      'DOCUMENT.PURPOSE_MISMATCH',
    );
    const contractFile = (await h.uploaded()).id;
    expect(
      h.codeOf(
        await h.recordSignature(registrationId, { documentId: contractFile, noticeVersionId: notice.id }).expect(422),
      ),
    ).toBe('DOCUMENT.PURPOSE_MISMATCH');
  });

  it('refuses a signed record for a file that is not the IT Admin’s own, for a version that does not exist and for a registration that ended', async () => {
    const notice = await h.published();
    const [first, second] = [await holder(), await holder()];
    const device = await h.registered(first.employeeId);
    const registrationId = device.registrationId as string;
    const foreign = await h.scan(it2);

    expect(
      h.codeOf(
        await h.recordSignature(registrationId, { documentId: foreign, noticeVersionId: notice.id }).expect(404),
      ),
    ).toBe('DOCUMENT.NOT_FOUND');
    expect(
      h.codeOf(
        await h
          .recordSignature(registrationId, { documentId: await h.scan(), noticeVersionId: randomUUID() })
          .expect(422),
      ),
    ).toBe('DEVICE_SIGNATURE_RECORD.NOTICE_VERSION_NOT_FOUND');
    expect(
      h.codeOf(
        await h.recordSignature(randomUUID(), { documentId: await h.scan(), noticeVersionId: notice.id }).expect(404),
      ),
    ).toBe('DEVICE_REGISTRATION.NOT_FOUND');
    await h.changeHolder(device.id, second.employeeId).expect(201);
    expect(
      h.codeOf(
        await h.recordSignature(registrationId, { documentId: await h.scan(), noticeVersionId: notice.id }).expect(409),
      ),
    ).toBe('DEVICE_REGISTRATION.ENDED');
    expect(h.codeOf(await h.acknowledge(first, registrationId, notice.id).expect(409))).toBe(
      'DEVICE_REGISTRATION.ENDED',
    );
    expect(await mine(first)).toMatchObject([
      { acknowledgementState: 'ENDED', canAcknowledge: false, blockedReason: 'REGISTRATION_ENDED' },
    ]);
  });

  it('an acknowledgement and a new version that asks again, at once, never leave a machine collected under the old version', async () => {
    const holderAccount = await holder();
    const old = await h.published();
    const device = await h.registered(holderAccount.employeeId);
    await h.signed(device.registrationId as string, old.id);

    const [acknowledged] = await Promise.all([
      h.acknowledge(holderAccount, device.registrationId as string, old.id),
      h.publishNotice({ ...NOTICE_TEXT, includesToolStatus: false, requiresReacknowledgement: true }),
    ]);

    expect([201, 409]).toContain(acknowledged.status);
    const shown = await sql().query<{ acknowledged_from: Date | null; latest: number; current: number }>(
      `SELECT r.acknowledged_from,
              (SELECT n.version_number FROM device_acknowledgements a JOIN monitoring_notice_versions n ON n.id = a.notice_version_id
                WHERE a.registration_id = r.id ORDER BY a.acknowledged_at DESC LIMIT 1) AS latest,
              (SELECT max(version_number) FROM monitoring_notice_versions) AS current
         FROM device_registrations r WHERE r.id = $1`,
      [device.registrationId],
    );
    const row = shown.rows[0];
    expect(row.acknowledged_from === null || row.latest === row.current).toBe(true);
  });

  it('TP-01: the database refuses to change or remove a version, a signed record or an acknowledgement', async () => {
    const notice = await h.published();
    const holderAccount = await holder();
    const machine = await h.active(holderAccount, notice);

    for (const table of ['monitoring_notice_versions', 'device_signature_records', 'device_acknowledgements']) {
      expect(await sqlState(sql(), `UPDATE ${table} SET organization_id = organization_id`)).toBe('55000');
      expect(await sqlState(sql(), `DELETE FROM ${table}`)).toBe('55000');
      expect(await sqlState(sql(), `TRUNCATE ${table} CASCADE`)).toBe('55000');
    }
    expect(machine.state).toBe('ACTIVE');
  });

  it('writes an audit event for every change, with nothing in it that looks like a secret', async () => {
    const actions = await sql().query<{ action: string }>(
      `SELECT DISTINCT action FROM audit_events WHERE action LIKE 'DEVICE%' OR action LIKE 'MONITORING_NOTICE%' ORDER BY action`,
    );
    const secret = await sql().query(
      `SELECT 1 FROM audit_events e, LATERAL jsonb_object_keys(coalesce(e.after, '{}'::jsonb) || coalesce(e.before, '{}'::jsonb)) k
        WHERE (e.action LIKE 'DEVICE%' OR e.action LIKE 'MONITORING_NOTICE%')
          AND k ~* 'pass|hash|token|secret|cookie|credential|authorization|pepper'`,
    );

    expect(actions.rows.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'DEVICE.REGISTERED',
        'DEVICE.HOLDER_CHANGED',
        'DEVICE_REGISTRATION.ENDED',
        'DEVICE_SIGNATURE_RECORD.RECORDED',
        'DEVICE_ACKNOWLEDGEMENT.RECORDED',
        'MONITORING_NOTICE.PUBLISHED',
      ]),
    );
    expect(secret.rowCount).toBe(0);
  });
});
