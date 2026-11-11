import { FlowWorld } from '../support/flows/flow-world';

/**
 * MF-5, F5-02, the department that owns a subscription has no head (`US-11-05` AC-23): the IT Admin still proposes, the case waits with
 * the reason `NO_HEAD`, nobody confirms it in the head's place and the Super Admin is told once. Real sign-in, the seeded dataset, nothing
 * mocked.
 *
 * Its own file because a file opens one application: the case lives once for each subscription period, and the two periods the dataset
 * gives Engineering (ChatGPT Plus, Cursor Pro — the only subscriptions with an owner department, see `mf5-rightsizing`) are decided by
 * the other files. Here the head of Engineering leaves and ChatGPT Plus is proposed.
 */
describe('MF-5 phòng sở hữu không có trưởng phòng: hồ sơ chờ và Super Admin được báo @MF5 @D1', () => {
  let world: FlowWorld;

  const call = () => world.calls;

  beforeAll(async () => {
    world = await FlowWorld.open();
  }, 300000);

  afterAll(async () => {
    await world?.close();
  });

  it('trưởng phòng nghỉ việc, IT Admin vẫn đề xuất được; hồ sơ chờ NO_HEAD, không ai xác nhận, Super Admin được báo một lần #9 @B5', async () => {
    await call().post('NV-SA', '/offboarding-cases', {
      employeeId: await world.facts.employeeId('NV-ENGH'),
      lastWorkingDay: call().today(),
      accessBlockMode: 'BLOCK_NOW',
      grounds: { type: 'HR_DECISION', reference: 'QĐ-NV-2026-09', issuer: 'Phòng Nhân sự', issuedOn: call().today() },
      successor: { kind: 'NONE' },
    });
    world.clock.jumpDays(1);
    await world.actors.signIn('NV-ITA1');
    await world.actors.signIn('NV-SA');
    await world.actors.signIn('NV-DES1');

    const proposed = await call().post('NV-ITA1', '/subscription-renewals', {
      subscriptionId: await call().subscriptionOf('ChatGPT Plus'),
      choice: 'RENEW',
    });

    expect(proposed.status).toBe(201);
    const id = call().data<{ renewal: { id: string } }>(proposed).renewal.id;
    const detail = call().data<{ renewal: { state: string; waitingReason: string | null } }>(
      await call().get('NV-ITA1', `/subscription-renewals/${id}`),
    ).renewal;
    expect(detail).toMatchObject({ state: 'PROPOSED', waitingReason: 'NO_HEAD' });
    const alerts = await world.facts.notices('CONTROLLED_WAIT_ALERT', id);
    expect(alerts.map((row) => row.recipient_employee_id)).toEqual([await world.facts.employeeId('NV-SA')]);
    for (const code of ['NV-ITA1', 'NV-DES1', 'NV-CEO']) {
      await world.actors.signIn(code);
      const refused = await call().post(code, `/subscription-renewals/${id}/decision`, { decision: 'CONFIRM' });
      expect([code, refused.status]).toEqual([code, 403]);
    }
    expect(
      (await world.facts.one<{ state: string }>(`SELECT state::text FROM subscription_renewals WHERE id = $1`, [id]))
        .state,
    ).toBe('PROPOSED');
  });
});
