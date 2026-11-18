import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../../src/modules/identity-access/public/identity-access.api';
import type { InvoiceDiscrepancyReferral } from '../../../src/modules/requests/public/requests.extension-points';
import { UsageImportListeners } from '../../../src/modules/usage/public/usage.extension-points';
import { VendorAccountIntakeService } from '../../../src/modules/usage/vendor-account-review/vendor-account-intake.service';
import { handOthersToSecondItAdmin } from '../../support/second-it-admin';
import { InvoiceHarness } from '../../support/invoice-harness';

const h = new InvoiceHarness();
const CODE = 'VENDOR_ACCOUNT_DISCREPANCY_OPENED';

interface Notice {
  recipient_employee_id: string;
  subject_type: string | null;
  event_key: string;
  params: Record<string, unknown>;
}

/**
 * The IT Admin is told when a difference with a vendor is opened (`SBF-08` step 4, B7, FX-T5): once for each report, invoice or batch of the
 * collector, not for each row, and only when a row is new. The IT Admin in charge of the application when it is known and can still act, else
 * every IT Admin who can. On real PostgreSQL.
 */
describe('the notices of the differences with a vendor over PostgreSQL (FX-T5)', () => {
  let applicationId: string;
  let vendorId: string;
  let responsible: string;
  let secondItAdmin: string;
  let serial = 0;

  const noticesOf = async (keyPart: string): Promise<Notice[]> =>
    (
      await h.ctx.sql.query<Notice>(
        `SELECT recipient_employee_id, subject_type, event_key, params
           FROM in_app_notifications WHERE code = $1 AND event_key = $2 ORDER BY recipient_employee_id`,
        [CODE, `${CODE}:${keyPart}`],
      )
    ).rows;
  const recipients = (notices: Notice[]) => notices.map((notice) => notice.recipient_employee_id).sort();
  const allUsable = async (): Promise<string[]> =>
    (await h.ctx.app.get(IdentityAccessApi).findAllUsableItAdminEmployeeIds()).sort();

  const lonelyMember = async (): Promise<string> => {
    serial += 1;
    const unit = await h.departmentWithHead(`P-VN${serial}`);

    return unit.member.employeeId;
  };
  const noSeat = async (employeeId: string, importId: string): Promise<void> => {
    await h.ctx.sql.query(
      `INSERT INTO usage_no_assignment_findings (organization_id, application_id, employee_id, first_activity_date, last_activity_date, last_import_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'OPEN')`,
      [h.seed.organizationId, applicationId, employeeId, `${h.year}-10-01`, `${h.year}-10-20`, importId],
    );
  };
  const nobodys = async (raw: string, importId: string): Promise<void> => {
    await h.ctx.sql.query(
      `INSERT INTO usage_unmatched_identities (organization_id, application_id, source_id, identifier_type, normalized_identifier, raw_identifier,
         reason, status, candidate_employee_ids, first_import_id, last_import_id)
       VALUES ($1, $2, $3, 'EMAIL', lower($4), $4, 'NOT_FOUND', 'OPEN', '{}', $5, $5)`,
      [h.seed.organizationId, applicationId, randomUUID(), raw, importId],
    );
  };
  const confirmed = (importId: string): Promise<void> =>
    h.ctx.app.get(TransactionRunner).run((tx) =>
      h.ctx.app.get(UsageImportListeners, { strict: false }).emit(tx, {
        moment: 'CONFIRMED',
        importId,
        sourceId: randomUUID(),
        applicationId,
        coverageTo: `${h.year}-10-31`,
      }),
    );
  const unlisted = (tool: string, day: string) =>
    h.ctx.app
      .get(TransactionRunner)
      .run((tx) =>
        h.ctx.app
          .get(VendorAccountIntakeService)
          .fromUnlistedTools(
            tx,
            { organizationId: h.seed.organizationId, sightings: [{ tool, date: `${h.year}-${day}` }] },
            new Date(`${h.year}-${day}T12:00:00Z`),
          ),
      );

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    secondItAdmin = (await handOthersToSecondItAdmin(h)).employeeId;
    const plan = await h.planOf(await h.subscription(20, 'K2'));
    vendorId = (await h.vendorOf(plan)).id;
    const application = (
      await h.ctx.sql.query<{ application_id: string; responsible: string }>(
        `SELECT p.application_id, a.responsible_it_admin_employee_id AS responsible
           FROM plans p JOIN applications a ON a.id = p.application_id WHERE p.id = $1`,
        [plan],
      )
    ).rows[0];
    applicationId = application.application_id;
    responsible = application.responsible;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  describe('from a confirmed report of the vendor', () => {
    it('tells the IT Admin in charge of the application once for the report, with how many rows are new, not once for each row', async () => {
      const importId = randomUUID();
      await noSeat(await lonelyMember(), importId);
      await noSeat(await lonelyMember(), importId);
      await nobodys(`lạ-${randomUUID()}@congty.vn`, importId);

      await confirmed(importId);

      const notices = await noticesOf(`USAGE_IMPORT:${importId}`);
      expect(recipients(notices)).toEqual([responsible]);
      expect(responsible).not.toBe(secondItAdmin);
      expect(notices[0]).toMatchObject({
        subject_type: null,
        params: { applicationId, vendorId, source: 'USAGE_IMPORT', newCount: 3 },
      });
      expect(Object.keys(notices[0].params).sort()).toEqual(['applicationId', 'newCount', 'source', 'vendorId']);
    });

    it('tells nobody when the same things are seen again in a later report: no row is new', async () => {
      const first = randomUUID();
      const later = randomUUID();
      await noSeat(await lonelyMember(), first);
      await confirmed(first);
      expect(await noticesOf(`USAGE_IMPORT:${first}`)).toHaveLength(1);

      await h.ctx.sql.query(`UPDATE usage_no_assignment_findings SET last_import_id = $2 WHERE last_import_id = $1`, [
        first,
        later,
      ]);
      await confirmed(later);

      expect(await noticesOf(`USAGE_IMPORT:${later}`)).toEqual([]);
    });

    it('tells nobody for a report that holds nothing', async () => {
      const importId = randomUUID();

      await confirmed(importId);

      expect(await noticesOf(`USAGE_IMPORT:${importId}`)).toEqual([]);
    });

    it('tells every IT Admin who can act when the one in charge of the application cannot', async () => {
      const importId = randomUUID();
      await noSeat(await lonelyMember(), importId);
      // Somebody who holds no IT Admin role stands for an IT Admin who left or lost the role.
      await h.ctx.sql.query(`UPDATE applications SET responsible_it_admin_employee_id = $2 WHERE id = $1`, [
        applicationId,
        h.finance.employeeId,
      ]);
      try {
        await confirmed(importId);
      } finally {
        await h.ctx.sql.query(`UPDATE applications SET responsible_it_admin_employee_id = $2 WHERE id = $1`, [
          applicationId,
          responsible,
        ]);
      }

      expect(recipients(await noticesOf(`USAGE_IMPORT:${importId}`))).toEqual(await allUsable());
      expect(await allUsable()).toEqual(expect.arrayContaining([responsible, secondItAdmin]));
    });
  });

  describe('from an invoice Finance closed as a suspicion', () => {
    const referral = (caseId: string): InvoiceDiscrepancyReferral => ({
      organizationId: h.seed.organizationId,
      caseId,
      purchaseInvoiceId: randomUUID(),
      vendorId,
      requestId: null,
      subscriptionId: null,
      mismatches: ['QUANTITY'],
      quantity: { invoice: 5, expected: 4 },
      unitPrice: { invoice: { amountMinor: 100000n, currency: 'VND' }, expected: null },
      differenceMinor: 100000n,
      reason: 'Khác số lượng',
      closedByEmployeeId: h.finance.employeeId,
      closedAt: new Date(`${h.year}-10-05T12:00:00Z`),
    });

    it('has no application, so tells every IT Admin who can act, with the vendor of the invoice', async () => {
      const caseId = randomUUID();

      await h.ctx.app
        .get(TransactionRunner)
        .run((tx) => h.ctx.app.get(VendorAccountIntakeService).fromInvoiceReferral(tx, referral(caseId)));

      const notices = await noticesOf(`INVOICE_DIFFERENCE:${caseId}`);
      expect(recipients(notices)).toEqual(await allUsable());
      expect(notices[0]).toMatchObject({
        subject_type: null,
        params: { applicationId: null, vendorId, source: 'INVOICE_DIFFERENCE', newCount: 1 },
      });
    });

    it('tells nobody when the same invoice is referred again', async () => {
      const caseId = randomUUID();
      const run = () =>
        h.ctx.app
          .get(TransactionRunner)
          .run((tx) => h.ctx.app.get(VendorAccountIntakeService).fromInvoiceReferral(tx, referral(caseId)));
      await run();
      const before = await noticesOf(`INVOICE_DIFFERENCE:${caseId}`);

      await run();

      expect(await noticesOf(`INVOICE_DIFFERENCE:${caseId}`)).toHaveLength(before.length);
    });
  });

  describe('from the tools the collector reports that are not on the allowlist', () => {
    it('tells every IT Admin who can act once for the day, with neither application nor vendor; a second batch of the day is not told again', async () => {
      const day = '11-04';
      await unlisted(`TOOL-${randomUUID().slice(0, 8)}`, day);

      const first = await noticesOf(`COLLECTOR_UNLISTED:${h.year}-${day}`);
      expect(recipients(first)).toEqual(await allUsable());
      expect(first[0]).toMatchObject({
        subject_type: null,
        params: { applicationId: null, vendorId: null, source: 'COLLECTOR_UNLISTED', newCount: 1 },
      });

      await unlisted(`TOOL-${randomUUID().slice(0, 8)}`, day);

      expect(await noticesOf(`COLLECTOR_UNLISTED:${h.year}-${day}`)).toHaveLength(first.length);
      await unlisted(`TOOL-${randomUUID().slice(0, 8)}`, '11-05');
      expect((await noticesOf(`COLLECTOR_UNLISTED:${h.year}-11-05`)).length).toBe(first.length);
    });

    it('tells nobody for a tool already seen', async () => {
      const tool = `TOOL-${randomUUID().slice(0, 8)}`;
      await unlisted(tool, '11-06');
      expect(await noticesOf(`COLLECTOR_UNLISTED:${h.year}-11-06`)).not.toHaveLength(0);

      await unlisted(tool, '11-07');

      expect(await noticesOf(`COLLECTOR_UNLISTED:${h.year}-11-07`)).toEqual([]);
    });
  });
});
