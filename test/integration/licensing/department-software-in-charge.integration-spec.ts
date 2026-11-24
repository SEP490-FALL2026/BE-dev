import request from 'supertest';
import { RequestHarness, type Department, type Person } from '../../support/request-harness';

const h = new RequestHarness();

interface ProposalWire {
  proposalId: string;
  state: 'PENDING' | 'ACCEPTED' | 'REJECTED';
}

interface Place {
  applicationId: string;
  planId: string;
}

describe('department software list and proposals acting IT Admin rules (integration, real PostgreSQL)', () => {
  let design: Department;
  let finance: Department;
  let unassigned: Department;
  let designHead: Person;
  let unassignedHead: Person;
  let designIt: Person;
  let financeIt: Person;

  const listOf = (departmentId: string, who: Record<string, string>) =>
    request(h.server()).get(`/api/v1/departments/${departmentId}/software-list`).set(who);
  const change = (departmentId: string, who: Record<string, string>, body: object) =>
    request(h.server()).post(`/api/v1/departments/${departmentId}/software-list/changes`).set(who).send(body);
  const propose = (who: Record<string, string>, body: object) =>
    request(h.server()).post('/api/v1/department-software-proposals').set(who).send(body);
  const listProposals = (who: Record<string, string>, query: object = {}) =>
    request(h.server()).get('/api/v1/department-software-proposals').query(query).set(who);
  const accept = (id: string, who: Record<string, string>) =>
    request(h.server()).post(`/api/v1/department-software-proposals/${id}/acceptance`).set(who);
  const reject = (id: string, who: Record<string, string>, body: object = { reason: 'Not needed' }) =>
    request(h.server()).post(`/api/v1/department-software-proposals/${id}/rejection`).set(who).send(body);
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

  const place = async (): Promise<Place> => {
    const planId = await h.plan('K1');
    const { rows } = await h.ctx.sql.query<{ application_id: string }>(
      'SELECT application_id FROM plans WHERE id = $1',
      [planId],
    );

    return { applicationId: rows[0].application_id, planId };
  };

  const proposedBy = async (who: Person, target: Place): Promise<ProposalWire> =>
    h.dataOf<{ proposal: ProposalWire }>(
      await propose(h.as(who.account), { ...target, reason: 'Team workflow needs this tool' }).expect(201),
    ).proposal;

  const auditAfterOf = async (action: string, resourceId: string): Promise<Record<string, unknown> | null> => {
    const { rows } = await h.ctx.sql.query<{ after: Record<string, unknown> | null }>(
      'SELECT after FROM audit_events WHERE action = $1 AND resource_id = $2 ORDER BY created_at DESC LIMIT 1',
      [action, resourceId],
    );

    return rows[0]?.after ?? null;
  };

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('P-DSIC-D');
    finance = await h.departmentWithUnit('P-DSIC-F');
    unassigned = await h.departmentWithUnit('P-DSIC-U');
    designHead = await h.staff(design, 'DSIC-D-H');
    unassignedHead = await h.staff(unassigned, 'DSIC-U-H');
    designIt = await h.staff(design, 'DSIC-D-IT', 'IT_ADMIN');
    financeIt = await h.staff(finance, 'DSIC-F-IT', 'IT_ADMIN');
    await h.makeHead(design, designHead);
    await h.makeHead(unassigned, unassignedHead);
    await h.setItAdminInCharge(design, designIt);
    await h.setItAdminInCharge(finance, financeIt);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('refuses another department IT Admin with 403 when in-charge IT Admin is locked, allows read, and allows appointed substitute with bySubstitute audit', async () => {
    const p1 = await place();
    const p2 = await place();
    const p3 = await place();
    const pList = await place();
    const propAccept = await proposedBy(designHead, p1);
    const propReject = await proposedBy(designHead, p2);
    const propAfterEnd = await proposedBy(designHead, p3);

    // While designIt is usable, financeIt is outside read scope: list change -> 403, proposal accept/reject -> 404.
    expect(
      h.codeOf(
        await change(design.id, h.as(financeIt.account), { add: [{ applicationId: pList.applicationId }] }).expect(403),
      ),
    ).toBe('DEPARTMENT.OUT_OF_SCOPE');
    expect(h.codeOf(await accept(propAccept.proposalId, h.as(financeIt.account)).expect(404))).toBe(
      'DEPARTMENT_SOFTWARE.PROPOSAL_NOT_FOUND',
    );
    expect(h.codeOf(await reject(propReject.proposalId, h.as(financeIt.account)).expect(404))).toBe(
      'DEPARTMENT_SOFTWARE.PROPOSAL_NOT_FOUND',
    );

    // Lock designIt: DES enters read scope for financeIt, but NOT acting scope.
    await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [designIt.account.appUserId]);
    try {
      await listOf(design.id, h.as(financeIt.account)).expect(200);
      const readProposals = h.dataOf<{ items: ProposalWire[] }>(
        await listProposals(h.as(financeIt.account), { departmentId: design.id, pageSize: 100 }).expect(200),
      );
      expect(readProposals.items.map((item) => item.proposalId)).toContain(propAccept.proposalId);

      // Write routes must refuse with 403 (no common queue for writes).
      expect(
        h.codeOf(
          await change(design.id, h.as(financeIt.account), { add: [{ applicationId: pList.applicationId }] }).expect(
            403,
          ),
        ),
      ).toBe('DEPARTMENT.OUT_OF_SCOPE');
      expect(h.codeOf(await accept(propAccept.proposalId, h.as(financeIt.account)).expect(403))).toBe(
        'DEPARTMENT_SOFTWARE.NOT_IN_CHARGE',
      );
      expect(h.codeOf(await reject(propReject.proposalId, h.as(financeIt.account)).expect(403))).toBe(
        'DEPARTMENT_SOFTWARE.NOT_IN_CHARGE',
      );

      // Super Admin appoints financeIt as substitute for DES -> writes succeed with bySubstitute: true in audit.
      const subId = h.dataOf<{ substitute: { id: string } }>(
        await appointSubstitute(design.id, financeIt.employeeId, 'Design IT locked').expect(201),
      ).substitute.id;
      try {
        const added = h.dataOf<{ added: { entryId: string }[] }>(
          await change(design.id, h.as(financeIt.account), { add: [{ applicationId: pList.applicationId }] }).expect(
            200,
          ),
        ).added[0];
        expect(await auditAfterOf('DEPARTMENT_SOFTWARE.ENTRY_ADDED', added.entryId)).toMatchObject({
          departmentId: design.id,
          applicationId: pList.applicationId,
          bySubstitute: true,
        });

        await change(design.id, h.as(financeIt.account), { remove: [added.entryId] }).expect(200);
        expect(await auditAfterOf('DEPARTMENT_SOFTWARE.ENTRY_REMOVED', added.entryId)).toEqual({ bySubstitute: true });

        const accepted = h.dataOf<{ proposal: ProposalWire; entryId: string }>(
          await accept(propAccept.proposalId, h.as(financeIt.account)).expect(200),
        );
        expect(accepted.proposal.state).toBe('ACCEPTED');
        expect(await auditAfterOf('DEPARTMENT_SOFTWARE.PROPOSAL_ACCEPTED', propAccept.proposalId)).toMatchObject({
          state: 'ACCEPTED',
          departmentId: design.id,
          bySubstitute: true,
        });
        expect(await auditAfterOf('DEPARTMENT_SOFTWARE.ENTRY_ADDED', accepted.entryId)).toMatchObject({
          departmentId: design.id,
          bySubstitute: true,
        });

        const rejected = h.dataOf<{ proposal: ProposalWire }>(
          await reject(propReject.proposalId, h.as(financeIt.account), { reason: 'Duplicate tool' }).expect(200),
        ).proposal;
        expect(rejected.state).toBe('REJECTED');
        expect(await auditAfterOf('DEPARTMENT_SOFTWARE.PROPOSAL_REJECTED', propReject.proposalId)).toMatchObject({
          state: 'REJECTED',
          departmentId: design.id,
          bySubstitute: true,
        });
      } finally {
        await endSubstitute(subId).expect(201);
      }

      // After substitute ends, financeIt is refused 403 again.
      expect(
        h.codeOf(
          await change(design.id, h.as(financeIt.account), { add: [{ applicationId: pList.applicationId }] }).expect(
            403,
          ),
        ),
      ).toBe('DEPARTMENT.OUT_OF_SCOPE');
      expect(h.codeOf(await accept(propAfterEnd.proposalId, h.as(financeIt.account)).expect(403))).toBe(
        'DEPARTMENT_SOFTWARE.NOT_IN_CHARGE',
      );
      expect(h.codeOf(await reject(propAfterEnd.proposalId, h.as(financeIt.account)).expect(403))).toBe(
        'DEPARTMENT_SOFTWARE.NOT_IN_CHARGE',
      );
    } finally {
      await h.ctx.sql.query(`UPDATE app_users SET status = 'ACTIVE' WHERE id = $1`, [designIt.account.appUserId]);
    }
  });

  it('refuses another department IT Admin with 403 when department has no IT Admin in charge (null) and no substitute', async () => {
    const p1 = await place();
    const p2 = await place();
    const prop = await proposedBy(unassignedHead, p1);

    // Readable by any IT Admin via read scope.
    await listOf(unassigned.id, h.as(financeIt.account)).expect(200);
    const listed = h.dataOf<{ items: ProposalWire[] }>(
      await listProposals(h.as(financeIt.account), { departmentId: unassigned.id, pageSize: 100 }).expect(200),
    );
    expect(listed.items.map((item) => item.proposalId)).toContain(prop.proposalId);

    // Blocked on write routes with 403.
    expect(
      h.codeOf(
        await change(unassigned.id, h.as(financeIt.account), { add: [{ applicationId: p2.applicationId }] }).expect(
          403,
        ),
      ),
    ).toBe('DEPARTMENT.OUT_OF_SCOPE');
    expect(h.codeOf(await accept(prop.proposalId, h.as(financeIt.account)).expect(403))).toBe(
      'DEPARTMENT_SOFTWARE.NOT_IN_CHARGE',
    );
    expect(h.codeOf(await reject(prop.proposalId, h.as(financeIt.account)).expect(403))).toBe(
      'DEPARTMENT_SOFTWARE.NOT_IN_CHARGE',
    );
  });
});
