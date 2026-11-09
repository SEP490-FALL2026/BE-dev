import { RenewalHarness, type RenewalUnit } from '../../support/renewal-harness';

const h = new RenewalHarness();

/**
 * EP-11 on real PostgreSQL: the hourly pass over the milestones of the subscription periods, run by hand as if it were a given day
 * — the alerts at T−15 and T−7 to the right people, once (`US-11-01`), the warning of missing contract data, the late flag of a
 * decision not carried out (`US-11-03` AC-13, AC-14), and the incident or the end mark of a milestone passed with no decision
 * (`US-11-04`). Nothing here renews, cancels or decides anything.
 */
describe('the pass over the milestones of the renewals (integration, real PostgreSQL)', () => {
  let unit: RenewalUnit;
  let superAdmin: string;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    unit = await h.unit(1);
    superAdmin = h.seed.superAdmin.employeeId;
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const alerts = (subscriptionId: string) => h.notices('SUBSCRIPTION_RENEWAL_ALERT', subscriptionId);
  const deadlineEventOf = async (subscriptionId: string) =>
    (
      await h.ctx.sql.query<{ kind: string; notice_base_date: string; auto_renew_at_time: boolean }>(
        `SELECT kind::text, to_char(notice_base_date, 'YYYY-MM-DD') AS notice_base_date, auto_renew_at_time
           FROM subscription_deadline_events WHERE subscription_id = $1`,
        [subscriptionId],
      )
    ).rows;

  describe('the alerts of the milestones (US-11-01)', () => {
    it('tells the IT Admin, Finance, the Business Owner and the decider at T−15, once, and adds the Super Admin at T−7 (AC-1, AC-11, AC-13)', async () => {
      const deadline = h.inDays(30);
      const subscriptionId = await h.term({
        ownerDepartmentId: unit.department.id,
        noticeDeadline: deadline,
        endDate: h.inDays(60),
      });

      await h.sweepOn(h.inDays(14));
      expect(await alerts(subscriptionId)).toEqual([]);
      await h.sweepOn(h.inDays(15));
      await h.sweepOn(h.inDays(15));
      await h.sweepOn(h.inDays(16));

      const early = await alerts(subscriptionId);
      expect(early.map((row) => row.recipient_employee_id).sort()).toEqual(
        [h.it1.employeeId, h.finance.employeeId, h.businessOwner, h.boss.employeeId].sort(),
      );
      expect(early[0].params).toMatchObject({
        subscriptionId,
        milestoneDays: 15,
        baseDate: deadline,
        noticeBasis: 'DECLARED',
        decisionRecorded: false,
        usageData: 'NOT_AVAILABLE',
      });
      const people = early.map((row) => row.recipient_employee_id);
      expect(people).not.toContain(unit.head.employeeId);
      expect(people).not.toContain(unit.members[0].employeeId);

      await h.sweepOn(h.inDays(23));
      const late = (await alerts(subscriptionId)).filter((row) => row.params.milestoneDays === 7);
      expect(late.map((row) => row.recipient_employee_id).sort()).toEqual(
        [h.it1.employeeId, h.finance.employeeId, h.businessOwner, h.boss.employeeId, superAdmin].sort(),
      );
      const sent = (await h.auditOf('Subscription', subscriptionId)).filter(
        (event) => event.action === 'SUBSCRIPTION_RENEWAL.ALERT_SENT',
      );
      expect(sent).toHaveLength(9);
    });

    it('counts from the deadline, never from the renewal date, and says when the deadline was inferred (AC-2, AC-4)', async () => {
      const inferred = await h.term({
        ownerDepartmentId: unit.department.id,
        renewalDate: h.inDays(50),
        endDate: h.inDays(49),
        noticePeriodDays: 30,
      });

      await h.sweepOn(h.inDays(5));
      expect((await alerts(inferred))[0]?.params).toMatchObject({
        noticeBasis: 'INFERRED_UNCONFIRMED',
        baseDate: h.inDays(20),
      });
      const before = (await alerts(inferred)).length;
      await h.sweepOn(h.inDays(43));
      expect(await alerts(inferred)).toHaveLength(before);
    });

    it('warns the IT Admin of missing contract data instead of guessing a milestone (AC-6, AC-14)', async () => {
      const undated = await h.term({ ownerDepartmentId: unit.department.id, autoRenew: true });

      await h.sweepOn(h.today());
      await h.sweepOn(h.today());

      expect(await alerts(undated)).toEqual([]);
      const warned = await h.notices('SUBSCRIPTION_RENEWAL_DATA_QUALITY', undated);
      expect(warned.map((row) => [row.recipient_employee_id, row.params.problem])).toEqual([
        [h.it1.employeeId, 'NO_ALERT_ANCHOR'],
      ]);
      const quality = (await h.auditOf('Subscription', undated)).filter(
        (event) => event.action === 'SUBSCRIPTION_RENEWAL.DATA_QUALITY_WARNED',
      );
      expect(quality).toHaveLength(1);
      expect(quality[0].after).toMatchObject({ problem: 'NO_ALERT_ANCHOR', recipientEmployeeId: h.it1.employeeId });
    });

    it('never alerts, warns, proposes nor records anything for a perpetual purchase (AC-9, US-11-04 AC-8, US-11-05 AC-15)', async () => {
      const perpetual = await h.perpetual();

      await h.sweepOn(h.today());
      await h.sweepOn(h.inDays(200));

      expect(await alerts(perpetual)).toEqual([]);
      expect(await h.notices('SUBSCRIPTION_RENEWAL_DATA_QUALITY', perpetual)).toEqual([]);
      expect(await deadlineEventOf(perpetual)).toEqual([]);
      expect(h.codeOf(await h.propose({ subscriptionId: perpetual, choice: 'RENEW' }).expect(409))).toBe(
        'SUBSCRIPTION_RENEWAL.NOT_RENEWABLE',
      );
    });

    it('leaves out T−7 only once both the decision and its outcome are recorded (AC-8, QĐ-62t)', async () => {
      const done = await h.term({
        ownerDepartmentId: unit.department.id,
        noticeDeadline: h.inDays(10),
        endDate: h.inDays(40),
      });
      const decidedOnly = await h.term({
        ownerDepartmentId: unit.department.id,
        noticeDeadline: h.inDays(10),
        endDate: h.inDays(40),
      });
      for (const subscriptionId of [done, decidedOnly]) {
        const id = await h.proposedRenewal({ subscriptionId, choice: 'RENEW' });
        await h.confirmRenewal(id, unit.head.account).expect(200);
        if (subscriptionId === done) {
          await h
            .outcome(id, { outcome: 'VENDOR_REFUSED', note: 'The vendor refused, e-mail of the account manager' })
            .expect(200);
        }
      }

      await h.sweepOn(h.inDays(3));

      expect(await alerts(done)).toEqual([]);
      const sent = await alerts(decidedOnly);
      expect(sent.map((row) => row.recipient_employee_id)).toContain(superAdmin);
      expect(sent[0].params).toMatchObject({ milestoneDays: 7, decisionRecorded: true, outcomeRecorded: false });
    });
  });

  describe('the milestone reached (US-11-03, US-11-04)', () => {
    it('flags a decision not carried out as late, once, tells the IT Admin and the decider, and records no incident (US-11-03 AC-13, AC-14)', async () => {
      const subscriptionId = await h.term({
        ownerDepartmentId: unit.department.id,
        noticeDeadline: h.inDays(5),
        endDate: h.inDays(35),
        autoRenew: true,
      });
      const id = await h.proposedRenewal({ subscriptionId, choice: 'RENEW' });
      await h.confirmRenewal(id, unit.head.account).expect(200);

      await h.sweepOn(h.inDays(4));
      expect((await h.caseRow(id)).late_flagged_at).toBeNull();
      await h.sweepOn(h.inDays(5));
      await h.sweepOn(h.inDays(6));

      expect((await h.caseRow(id)).late_flagged_at).not.toBeNull();
      const told = await h.notices('SUBSCRIPTION_RENEWAL_LATE', id);
      expect(told.map((row) => row.recipient_employee_id).sort()).toEqual(
        [h.it1.employeeId, unit.head.employeeId].sort(),
      );
      expect(await deadlineEventOf(subscriptionId)).toEqual([]);
      const list = h.dataOf<{ items: { id: string; lateFlagged: boolean }[] }>(
        await h.renewals('?late=true').expect(200),
      );
      expect(list.items.find((item) => item.id === id)?.lateFlagged).toBe(true);
      const flagged = (await h.auditOf('SubscriptionRenewal', id)).filter(
        (event) => event.action === 'SUBSCRIPTION_RENEWAL.FLAGGED_LATE',
      );
      expect(flagged).toHaveLength(1);
      expect(flagged[0].after).toMatchObject({ subscriptionId });

      await h.outcome(id, { outcome: 'UNCONFIRMED' }).expect(200);
      expect((await h.caseRow(id)).late_flagged_at).not.toBeNull();
    });

    it('records one incident for a self-renewing period with no decision, and an end mark otherwise (US-11-04 AC-1, AC-4, AC-6, AC-7)', async () => {
      const renewing = await h.term({
        ownerDepartmentId: unit.department.id,
        noticeDeadline: h.inDays(-2),
        endDate: h.inDays(28),
        autoRenew: true,
      });
      const ending = await h.term({
        ownerDepartmentId: unit.department.id,
        noticeDeadline: h.inDays(-2),
        endDate: h.inDays(28),
      });
      const decidedInTime = await h.term({
        ownerDepartmentId: unit.department.id,
        noticeDeadline: h.inDays(1),
        endDate: h.inDays(30),
        autoRenew: true,
      });
      const decidedId = await h.proposedRenewal({ subscriptionId: decidedInTime, choice: 'CANCEL' });
      await h.confirmRenewal(decidedId, unit.head.account).expect(200);

      await h.sweepOn(h.today());
      await h.sweepOn(h.today());
      await h.sweepOn(h.inDays(2));

      expect(await deadlineEventOf(renewing)).toEqual([
        { kind: 'AUTO_RENEWAL_INCIDENT', notice_base_date: h.inDays(-2), auto_renew_at_time: true },
      ]);
      expect(await deadlineEventOf(ending)).toEqual([
        { kind: 'EXPIRY_MARKED', notice_base_date: h.inDays(-2), auto_renew_at_time: false },
      ]);
      expect(await deadlineEventOf(decidedInTime)).toEqual([]);
      const marks = async (subscriptionId: string, action: string) =>
        (await h.auditOf('Subscription', subscriptionId)).filter((event) => event.action === action);
      const incidentAudit = await marks(renewing, 'SUBSCRIPTION.AUTO_RENEWAL_INCIDENT');
      expect(incidentAudit).toHaveLength(1);
      expect(incidentAudit[0].after).toMatchObject({
        baseDate: h.inDays(-2),
        autoRenew: true,
        reason: 'NO_DECISION_BY_MILESTONE',
      });
      expect(await marks(renewing, 'SUBSCRIPTION.EXPIRY_MARKED')).toEqual([]);
      const endAudit = await marks(ending, 'SUBSCRIPTION.EXPIRY_MARKED');
      expect(endAudit).toHaveLength(1);
      expect(endAudit[0].after).toMatchObject({ autoRenew: false, reason: 'NO_DECISION_BY_MILESTONE' });
      expect(await marks(ending, 'SUBSCRIPTION.AUTO_RENEWAL_INCIDENT')).toEqual([]);
      expect(await marks(decidedInTime, 'SUBSCRIPTION.EXPIRY_MARKED')).toEqual([]);
      expect(await marks(decidedInTime, 'SUBSCRIPTION.AUTO_RENEWAL_INCIDENT')).toEqual([]);
      expect(
        (await h.notices('SUBSCRIPTION_AUTO_RENEWAL_INCIDENT', renewing))
          .map((row) => row.recipient_employee_id)
          .sort(),
      ).toEqual([h.it1.employeeId, h.boss.employeeId].sort());
      const incidents = h.dataOf<{
        items: { subscription: { id: string }; kind: string }[];
        pagination: { totalItems: number };
      }>(await h.deadlineEvents('?kind=AUTO_RENEWAL_INCIDENT', h.boss.account).expect(200));
      expect(incidents.items.filter((item) => item.subscription.id === renewing)).toHaveLength(1);
      expect(incidents.items.every((item) => item.kind === 'AUTO_RENEWAL_INCIDENT')).toBe(true);
      await h.deadlineEvents('', unit.head.account).expect(403);

      // A decision taken after the incident is never voided and leaves the incident as it was.
      const lateId = await h.proposedRenewal({ subscriptionId: renewing, choice: 'RENEW' });
      const lateDecision = await h.confirmRenewal(lateId, unit.head.account).expect(200);
      expect(
        h.dataOf<{ renewal: { decision: { executionPoint: string } } }>(lateDecision).renewal.decision.executionPoint,
      ).toBe('NEXT_RENEWAL');
      await h.sweepOn(h.inDays(3));
      expect(await deadlineEventOf(renewing)).toHaveLength(1);
      await expect(
        h.ctx.sql.query(`DELETE FROM subscription_deadline_events WHERE subscription_id = $1`, [renewing]),
      ).rejects.toMatchObject({ constraint: 'subscription_deadline_events_immutable' });
    });

    it('tells a Business Owner who left nothing and asks the IT Admin to name another (US-11-01 AC-10)', async () => {
      const subscriptionId = await h.term({
        ownerDepartmentId: unit.department.id,
        noticeDeadline: h.inDays(40),
        endDate: h.inDays(70),
      });
      await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [h.businessOwner]);
      try {
        await h.sweepOn(h.inDays(25));

        const people = (await alerts(subscriptionId)).map((row) => row.recipient_employee_id);
        expect(people).not.toContain(h.businessOwner);
        expect(people).toEqual(expect.arrayContaining([h.it1.employeeId, h.finance.employeeId, h.boss.employeeId]));
        expect(
          (await h.notices('SUBSCRIPTION_BUSINESS_OWNER_LEFT', subscriptionId)).map((row) => row.recipient_employee_id),
        ).toEqual([h.it1.employeeId]);
      } finally {
        await h.ctx.sql.query(`UPDATE employees SET status = 'ACTIVE' WHERE id = $1`, [h.businessOwner]);
      }
    });
  });
});
