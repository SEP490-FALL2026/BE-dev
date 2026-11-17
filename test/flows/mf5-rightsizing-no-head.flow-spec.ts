import { FlowWorld } from '../support/flows/flow-world';

/**
 * MF-5, F5-02, a subscription with no department head behind it (`SBF-20`: the point of adjustment of the shared pool, `QĐ-103d`). A workspace
 * of the pool has no owner department, so there is no head to wait for; and even when the department of its IT Admin has no head (`US-11-05`
 * AC-23), the IT Admin in charge records the result at once: the case is written complete, nothing waits, nobody is sent a controlled-wait
 * alert and only Finance is told. Real sign-in, the seeded dataset, nothing mocked.
 *
 * Its own file because a file opens one application and the case lives once for each period: the Figma period the dataset gives is
 * recorded by the other files, so here the Design department loses its head and the IT Admin in charge of Figma records its result.
 */
describe('MF-5 thuê bao kho không có phòng sở hữu, phòng không có trưởng phòng: IT phụ trách ghi ngay @MF5 @D1', () => {
  let world: FlowWorld;

  const call = () => world.calls;

  beforeAll(async () => {
    world = await FlowWorld.open();
  }, 300000);

  afterAll(async () => {
    await world?.close();
  });

  it('thuê bao kho không có phòng sở hữu; trưởng phòng nghỉ, IT phụ trách ghi kết quả một lần, hồ sơ không chờ ai, Finance được báo #9 @B5', async () => {
    const subscriptionId = await call().subscriptionOf('Figma Professional');
    expect(
      (
        await world.facts.one<{ owner_department_id: string | null }>(
          `SELECT owner_department_id FROM subscriptions WHERE id = $1`,
          [subscriptionId],
        )
      ).owner_department_id,
    ).toBeNull();

    // The head of Design (the department of the IT Admin in charge of Figma) leaves; the Super Admin leaves the department without a head
    // (a head who leaves needs a successor, `QĐ-110h`).
    const { department_id: departmentId } = await world.facts.one<{ department_id: string }>(
      `SELECT department_id FROM department_head_periods WHERE employee_id = $1 AND valid_to IS NULL`,
      [await world.facts.employeeId('NV-DESH')],
    );
    const vacated = await call().post('NV-SA', `/departments/${departmentId}/head-vacancies`, {
      effectiveFrom: call().today(),
    });
    expect(vacated.status).toBe(200);
    world.clock.jumpDays(1);
    for (const code of ['NV-ITA2', 'NV-FIN1', 'NV-SA', 'NV-CEO']) await world.actors.signIn(code);

    const seen = call().data<{
      adjustment: {
        target: number;
        purchasedQuantity: number;
        renewalOn: string;
        callerIsResponsible: boolean;
        responsibleItAdminEmployeeId: string;
      };
    }>(await call().get('NV-ITA2', `/subscription-renewals/adjustment?subscriptionId=${subscriptionId}`)).adjustment;
    expect(seen).toMatchObject({
      callerIsResponsible: true,
      responsibleItAdminEmployeeId: await world.facts.employeeId('NV-ITA2'),
    });

    const recorded = await call().post('NV-ITA2', '/subscription-renewals', {
      subscriptionId,
      choice: seen.target < seen.purchasedQuantity ? 'REDUCE' : 'RENEW',
      proposedQuantity: seen.target,
      outcome: 'UNCONFIRMED',
    });

    expect(recorded.status).toBe(201);
    const renewal = call().data<{
      renewal: { id: string; state: string; waitingReason: string | null; decision: { deciderRole: string } };
    }>(recorded).renewal;
    expect(renewal).toMatchObject({
      state: 'OUTCOME_RECORDED',
      waitingReason: null,
      decision: { deciderRole: 'IT_ADMIN_IN_CHARGE' },
    });
    // Nobody waits and nobody is alerted that a head is missing: the Super Admin hears nothing of this case.
    expect(await world.facts.notices('CONTROLLED_WAIT_ALERT', renewal.id)).toEqual([]);
    expect(await world.facts.notices('SUBSCRIPTION_RENEWAL_PROPOSED', renewal.id)).toEqual([]);
    expect(await world.facts.count('subscription_renewals', `state = 'PROPOSED'`)).toBe(0);
    // The one in charge recorded it themselves: only Finance is told (nobody stands in).
    expect(
      (await world.facts.notices('SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED', subscriptionId)).map(
        (row) => row.recipient_employee_id,
      ),
    ).toEqual([await world.facts.employeeId('NV-FIN1')]);
    expect(
      call().data<{ renewal: { state: string } }>(await call().get('NV-FIN1', `/subscription-renewals/${renewal.id}`))
        .renewal.state,
    ).toBe('OUTCOME_RECORDED');
    // No head, no Super Admin and no spending approver is a party to it: none can record or confirm.
    for (const code of ['NV-SA', 'NV-CEO']) {
      const refused = await call().post(code, '/subscription-renewals', {
        subscriptionId,
        choice: 'RENEW',
        outcome: 'UNCONFIRMED',
      });
      expect([code, refused.status]).toEqual([code, 403]);
    }
  });
});
