import { BudgetAttachmentHarness } from '../../support/budget-attachment-harness';

const h = new BudgetAttachmentHarness();

describe('budget mine versions (integration)', () => {
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    const executive = await h.departmentWithUnit('P-EXE');
    const boss = await h.staff(executive, 'EXE-C1');
    await h.makeHead(executive, await h.staff(executive, 'EXE-H1'));
    await h.setRole('SPENDING_APPROVER', boss);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const waiting = async (year?: number) => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-MV${counter}`);
    const proposal = await h.budgetProposed(unit.head, unit.department.unitId, undefined, year);
    const version = await h.built(proposal.id);
    return { ...unit, proposal, version };
  };

  it('lists the sent versions of the head’s own Cost Center without amounts', async () => {
    const { head, version: v1 } = await waiting(2027);

    // Send v1
    await h.sendVersion(v1.id).expect(200);

    // List mine versions
    const res = await h.listMineVersions('', head.account).expect(200);
    const body = res.body as { message: string; data: { items: Array<Record<string, unknown>> } };
    expect(body.message).toBe('BUDGET.VERSIONS_LISTED');

    const items = body.data.items;
    expect(items.length).toBe(1);

    const first = items[0];
    expect(first.id).toBe(v1.id);
    expect(first.year).toBe(2027);
    expect(first.number).toBe(1);
    expect(first.state).toBe('SENT');
    expect(first.sentAt).toBeDefined();

    // Verify absence of amounts, lines, comments
    expect(first.amount).toBeUndefined();
    expect(first.totalAmount).toBeUndefined();
    expect(first.lines).toBeUndefined();
    expect(first.comment).toBeUndefined();
  });

  it('filters mine versions by year', async () => {
    const { head, version: v1 } = await waiting(2027);
    await h.sendVersion(v1.id).expect(200);

    const res2027 = await h.listMineVersions('?year=2027', head.account).expect(200);
    const body2027 = res2027.body as { data: { items: Array<Record<string, unknown>> } };
    expect(body2027.data.items.length).toBe(1);
    expect(body2027.data.items[0].year).toBe(2027);

    const res2099 = await h.listMineVersions('?year=2099', head.account).expect(200);
    const body2099 = res2099.body as { data: { items: Array<Record<string, unknown>> } };
    expect(body2099.data.items.length).toBe(0);
  });
});
