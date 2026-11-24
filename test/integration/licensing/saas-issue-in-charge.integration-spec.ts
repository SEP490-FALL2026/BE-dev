import request from 'supertest';
import type { Person } from '../../support/request-harness';
import { MONDAY, SaasIssueHarness } from '../../support/saas-issue-harness';

const h = new SaasIssueHarness();

/**
 * W2-27 (d) H9: only an acting IT Admin (appointed substitute if usable, otherwise usable in-charge) of the reporter's
 * work department may transition or mark duplicate an assigned SaaS issue report; non-acting IT Admins and any IT Admin on
 * an unassigned issue receive `403 SAAS_ISSUE.NOT_IN_CHARGE`; an appointed substitute records `bySubstitute: true` and
 * `onBehalfOf` on audit events and entries.
 */
describe('SaaS issue acting IT Admin guard and substitute attribution (integration, real PostgreSQL)', () => {
  let figma: { subscriptionId: string };
  let it1: Person;
  let seq = 0;
  let restoreToday: (() => void) | undefined;

  const appointSubstitute = (departmentId: string, substituteEmployeeId: string, reason = 'Cover') =>
    request(h.server())
      .post(`/api/v1/departments/${departmentId}/it-substitutes`)
      .set({ Authorization: `Bearer ${h.admin}` })
      .send({ substituteEmployeeId, reason });

  const endSubstitute = (substituteId: string) =>
    request(h.server())
      .post(`/api/v1/department-it-substitutes/${substituteId}/end`)
      .set({ Authorization: `Bearer ${h.admin}` })
      .send();

  beforeAll(async () => {
    await h.start();
    figma = { subscriptionId: await h.subscription(80, 'K2') };
    it1 = { employeeId: h.it1.employeeId, account: h.it1 };
  }, 300000);

  afterEach(() => {
    restoreToday?.();
    restoreToday = undefined;
  });

  afterAll(async () => {
    await h.stop();
  });

  const reporter = async (inCharge: Person | null) => {
    seq += 1;

    return h.reporterIn(`P-SIC${seq}`, inCharge, figma);
  };

  it('refuses a non-acting IT Admin on transition and markDuplicate with 403 SAAS_ISSUE.NOT_IN_CHARGE', async () => {
    restoreToday = h.pretendToday(MONDAY);
    const { member, assignmentId } = await reporter(it1);
    const otherDept = await h.departmentWithUnit(`P-SICOTH${(seq += 1)}`);
    const itB = await h.staff(otherDept, `E-SICB-${seq}`, 'IT_ADMIN');
    const original = await h.reported(member.account, assignmentId);
    const issue = await h.reported(member.account, assignmentId);

    const trRes = await h.moveIssue(issue.id, { to: 'IN_PROGRESS' }, itB.account).expect(403);
    expect(h.codeOf(trRes)).toBe('SAAS_ISSUE.NOT_IN_CHARGE');

    const dupRes = await h
      .duplicateIssue(issue.id, { ofIssueId: original.id, reason: 'Duplicate' }, itB.account)
      .expect(403);
    expect(h.codeOf(dupRes)).toBe('SAAS_ISSUE.NOT_IN_CHARGE');
    expect((await h.issueRow(issue.id)).state).toBe('NEW');
  });

  it('refuses transition and markDuplicate with 403 SAAS_ISSUE.NOT_IN_CHARGE when the issue is unassigned', async () => {
    restoreToday = h.pretendToday(MONDAY);
    const { member, assignmentId } = await reporter(null);
    const otherDept = await h.departmentWithUnit(`P-SICUN${(seq += 1)}`);
    const itB = await h.staff(otherDept, `E-SICUN-${seq}`, 'IT_ADMIN');
    const original = await h.reported(member.account, assignmentId);
    const unassigned = await h.reported(member.account, assignmentId);
    expect(unassigned.assignedItAdmin).toBeNull();

    for (const account of [h.it1, itB.account]) {
      expect(h.codeOf(await h.moveIssue(unassigned.id, { to: 'IN_PROGRESS' }, account).expect(403))).toBe(
        'SAAS_ISSUE.NOT_IN_CHARGE',
      );
      expect(
        h.codeOf(
          await h.duplicateIssue(unassigned.id, { ofIssueId: original.id, reason: 'Same' }, account).expect(403),
        ),
      ).toBe('SAAS_ISSUE.NOT_IN_CHARGE');
    }
    expect((await h.issueRow(unassigned.id)).state).toBe('NEW');
  });

  it('refuses non-substitute when in-charge IT Admin is locked, then allows appointed substitute with bySubstitute: true and onBehalfOf', async () => {
    restoreToday = h.pretendToday(MONDAY);
    const deptA = await h.departmentWithUnit(`P-SICA${(seq += 1)}`);
    const itA = await h.staff(deptA, `E-SICA-${seq}`, 'IT_ADMIN');
    const deptB = await h.departmentWithUnit(`P-SICB${seq}`);
    const itB = await h.staff(deptB, `E-SICB-${seq}`, 'IT_ADMIN');
    const { department, member, assignmentId } = await reporter(itA);

    const original = await h.reported(member.account, assignmentId);
    const issueToResolve = await h.reported(member.account, assignmentId);
    const issueToDuplicate = await h.reported(member.account, assignmentId);

    await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [itA.account.appUserId]);
    try {
      expect(h.codeOf(await h.moveIssue(issueToResolve.id, { to: 'IN_PROGRESS' }, itB.account).expect(403))).toBe(
        'SAAS_ISSUE.NOT_IN_CHARGE',
      );
      expect(
        h.codeOf(
          await h
            .duplicateIssue(issueToDuplicate.id, { ofIssueId: original.id, reason: 'Duplicate' }, itB.account)
            .expect(403),
        ),
      ).toBe('SAAS_ISSUE.NOT_IN_CHARGE');

      const subRes = await appointSubstitute(department.id, itB.employeeId, 'In-charge locked').expect(201);
      const substituteId = h.dataOf<{ substitute: { id: string } }>(subRes).substitute.id;
      try {
        await h.moveIssue(issueToResolve.id, { to: 'IN_PROGRESS' }, itB.account).expect(200);
        await h.moveIssue(issueToResolve.id, { to: 'RESOLVED', resolution: 'Fixed by sub' }, itB.account).expect(200);

        const transitioned = await h.issueEvents('SAAS_ISSUE.TRANSITIONED', issueToResolve.id);
        expect(transitioned).toHaveLength(2);
        for (const ev of transitioned) {
          expect(ev.after).toMatchObject({ onBehalfOf: itA.employeeId, bySubstitute: true });
        }
        const resolved = await h.issueEvents('SAAS_ISSUE.RESOLVED', issueToResolve.id);
        expect(resolved).toHaveLength(1);
        expect(resolved[0].after).toMatchObject({ onBehalfOf: itA.employeeId, bySubstitute: true });

        await h
          .duplicateIssue(issueToDuplicate.id, { ofIssueId: original.id, reason: 'Same root cause' }, itB.account)
          .expect(200);
        const duplicated = await h.issueEvents('SAAS_ISSUE.DUPLICATED', issueToDuplicate.id);
        expect(duplicated).toHaveLength(1);
        expect(duplicated[0].after).toMatchObject({ onBehalfOf: itA.employeeId, bySubstitute: true });

        const dupEntries = await h.entriesOf(issueToDuplicate.id, itB.account);
        expect(dupEntries.at(-1)).toMatchObject({
          author: { employeeId: itB.employeeId },
          onBehalfOf: { employeeId: itA.employeeId },
          toState: 'DUPLICATE',
        });
      } finally {
        await endSubstitute(substituteId).expect(201);
      }
    } finally {
      await h.ctx.sql.query(`UPDATE app_users SET status = 'ACTIVE' WHERE id = $1`, [itA.account.appUserId]);
    }
  });
});
