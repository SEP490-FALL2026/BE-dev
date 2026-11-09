import request from 'supertest';
import { BudgetAttachmentHarness, SAMPLE_PDF } from '../../support/budget-attachment-harness';
import type { ProposalWire } from '../../support/budget-harness';
import type { Department, Person } from '../../support/request-harness';

const h = new BudgetAttachmentHarness();

/**
 * `qd103-department-effective-year`, Task 4 (QĐ-106k, R-I05): the head of a department that takes effect on 1 January of next year does
 * the whole of the budget work for that year before the department starts (send, read, attach, withdraw, send again, `budgetMine`),
 * once Finance has made its Cost Center; for this year they have nothing. A person who answers for two units that year names which.
 */
describe('the head of a department that starts next year does the budget work (integration, real PostgreSQL)', () => {
  let counter = 0;
  let start: string;
  const code = (prefix: string) => `${prefix}${(counter += 1)}`;
  const asAdmin = () => ({ Authorization: `Bearer ${h.admin}` });

  /** A department that takes effect next 1 January, with a Cost Center unless said otherwise. */
  const upcoming = async (withCostCenter = true): Promise<Department> => {
    const department = await h.departmentWithUnit(code('P-UP'));
    await h.ctx.sql.query(`UPDATE departments SET effective_from = $2 WHERE id = $1`, [department.id, start]);
    if (!withCostCenter) {
      await h.ctx.sql.query(
        `UPDATE cost_centers SET status = 'INACTIVE', deactivated_at = now() WHERE department_id = $1`,
        [department.id],
      );
    }

    return department;
  };
  /** A person placed in the department, and its head, from the day it takes effect. */
  const futureHead = async (department: Department): Promise<Person> => {
    const person = await h.unplacedStaff(code('UPH'), 'MANAGER');
    await request(h.server())
      .post(`/api/v1/employees/${person.employeeId}/first-placements`)
      .set(asAdmin())
      .send({ departmentId: department.id, effectiveFrom: start })
      .expect(201);
    await request(h.server())
      .post(`/api/v1/departments/${department.id}/head-assignments`)
      .set(asAdmin())
      .send({ employeeId: person.employeeId, effectiveFrom: start })
      .expect(200);

    return person;
  };

  beforeAll(async () => {
    await h.start();
    start = `${h.next}-01-01`;
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('sends, reads, attaches, withdraws, is given back and sends again for next year (DA2-09)', async () => {
    const department = await upcoming();
    const head = await futureHead(department);

    const sent = h.dataOf<{ proposal: ProposalWire }>(
      await h.submitProposal({ year: h.next, lines: h.twoLines() }, head.account).expect(201),
    ).proposal;
    expect(sent.costCenter.id).toBe(department.unitId);
    await h.proposalOf(sent.id, head.account).expect(200);
    await h.proposalLines(sent.id, head.account).expect(200);
    expect(
      h.dataOf<{ budget: { costCenter: { id: string }; proposal: { id: string } | null } }>(
        await h.mine(head.account, h.next).expect(200),
      ).budget,
    ).toMatchObject({ costCenter: { id: department.unitId }, proposal: { id: sent.id } });
    const declared = await h.declareProposalAttachment(SAMPLE_PDF, head.account).expect(201);
    expect(declared.status).toBe(201);

    await h.withdraw(sent.id, head.account).expect(200);
    const again = await h.budgetProposed(head, department.unitId);
    await h.giveBack(again.id, { reason: 'Add the seats' }, h.finance).expect(200);
    await h.resubmit(again.id, { lines: h.twoLines() }, head.account).expect(201);
  });

  it('completes, links and reads the documents of the proposal, and reads its own lines and versions, before the department starts (DA2-09)', async () => {
    const department = await upcoming();
    const head = await futureHead(department);
    const file = await h.uploaded(SAMPLE_PDF, head.account);

    const sent = h.dataOf<{ proposal: ProposalWire }>(
      await h.submitProposal({ year: h.next, lines: h.twoLines(), attachmentIds: [file] }, head.account).expect(201),
    ).proposal;
    const listed = await h.listProposalAttachments(sent.id, '', head.account).expect(200);
    await h.linkAttachment(file, head.account).expect(200);

    expect(h.dataOf<{ items: { id: string }[] }>(listed).items.map((item) => item.id)).toEqual([file]);
    await h.mineLines(head.account, h.next).expect(200);
    await h.listMineVersions(`?year=${h.next}`, head.account).expect(200);
  });

  it('has nothing to do for this year: the department has not started (403 NOT_YOUR_COST_CENTER)', async () => {
    const department = await upcoming();
    const head = await futureHead(department);

    const sent = await h.submitProposal({ year: h.year, lines: h.twoLines() }, head.account).expect(403);
    const mine = await h.mine(head.account, h.year).expect(403);

    expect(h.codeOf(sent)).toBe('BUDGET.NOT_YOUR_COST_CENTER');
    expect(h.codeOf(mine)).toBe('BUDGET.NOT_YOUR_COST_CENTER');
  });

  it('tells the head the setup is incomplete while Finance has made no Cost Center for the department (FINANCE.SETUP_INCOMPLETE)', async () => {
    const department = await upcoming(false);
    const head = await futureHead(department);

    const refused = await h.submitProposal({ year: h.next, lines: h.twoLines() }, head.account).expect(409);

    expect(h.codeOf(refused)).toBe('FINANCE.SETUP_INCOMPLETE');
  });

  it('asks which Cost Center when the person answers for two that year, and takes the one they name (COST_CENTER_REQUIRED)', async () => {
    const { head, department: old } = await h.departmentWithHead(code('P-OLD'));
    const department = await upcoming();
    // The head of the old department moves to the new one on 1 January: the old term ends that day, the new one starts.
    await h.ctx.sql.query(`UPDATE employee_placements SET valid_to = $2 WHERE employee_id = $1 AND valid_to IS NULL`, [
      head.employeeId,
      start,
    ]);
    await h.ctx.sql.query(
      `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
       SELECT gen_random_uuid(), organization_id, $1, $2, $3 FROM employees WHERE id = $1`,
      [head.employeeId, department.id, start],
    );
    await h.ctx.sql.query(
      `UPDATE department_head_periods SET valid_to = $2 WHERE employee_id = $1 AND valid_to IS NULL`,
      [head.employeeId, start],
    );
    await h.ctx.sql.query(
      `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
       SELECT gen_random_uuid(), organization_id, $2, $1, $3 FROM employees WHERE id = $1`,
      [head.employeeId, department.id, start],
    );

    const unnamed = await h.submitProposal({ year: h.next, lines: h.twoLines() }, head.account).expect(422);
    const stranger = await h
      .submitProposal({ year: h.next, lines: h.twoLines(), costCenterId: h.finance.employeeId }, head.account)
      .expect(403);
    const named = await h
      .submitProposal({ year: h.next, lines: h.twoLines(), costCenterId: department.unitId }, head.account)
      .expect(201);
    const oldOne = await h
      .submitProposal({ year: h.next, lines: h.twoLines(), costCenterId: old.unitId }, head.account)
      .expect(201);
    const mineUnnamed = await h.mine(head.account, h.next).expect(422);
    const mineNamed = await request(h.server())
      .get('/api/v1/budgets/mine')
      .query({ year: h.next, costCenterId: department.unitId })
      .set(h.as(head.account))
      .expect(200);

    expect(h.codeOf(unnamed)).toBe('BUDGET.COST_CENTER_REQUIRED');
    expect(h.codeOf(stranger)).toBe('BUDGET.NOT_YOUR_COST_CENTER');
    expect(h.dataOf<{ proposal: ProposalWire }>(named).proposal.costCenter.id).toBe(department.unitId);
    expect(h.dataOf<{ proposal: ProposalWire }>(oldOne).proposal.costCenter.id).toBe(old.unitId);
    expect(h.codeOf(mineUnnamed)).toBe('BUDGET.COST_CENTER_REQUIRED');
    expect(h.dataOf<{ budget: { costCenter: { id: string } } }>(mineNamed).budget.costCenter.id).toBe(
      department.unitId,
    );
  });
});
