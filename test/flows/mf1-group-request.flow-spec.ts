import { FlowWorld } from '../support/flows/flow-world';

/**
 * MF-1, F1-08 (the part of Wave 1): a Request for a group of at least two people goes through the need of the head, the spend of the
 * spending approver and the grant of the IT Admin line by line, without the client ever sending a date; and a contractor can be
 * granted, the Assignment carrying an end date worked out from the term of the Request (finding R1 of the review of steps 6 and 7).
 */
describe('F1-08 Request nhóm: nhu cầu → trình lô → duyệt chi → cấp từng dòng @MF1 @D1', () => {
  let world: FlowWorld;
  let jira: string;
  let figma: string;

  const call = () => world.calls;
  const idOf = (response: { body: unknown }) =>
    (response.body as { data: { request: { id: string } } }).data.request.id;
  const stateOf = async (id: string) =>
    (await world.facts.one<{ state: string }>(`SELECT state::text FROM access_requests WHERE id = $1`, [id])).state;
  /** The last day of a term that starts today: the same day a month on, less one (the term of 1 month). */
  const oneMonthTerm = async () =>
    (
      await world.facts.one<{ day: string }>(
        `SELECT to_char(($1::date + interval '1 month' - interval '1 day')::date, 'YYYY-MM-DD') AS day`,
        [call().today()],
      )
    ).day;

  /** The IT Admin grants one line: create the task, take it, complete it. */
  const grantLine = async (requestId: string, subscriptionId: string, beneficiaryEmployeeId: string) => {
    const created = await call().post('NV-ITA1', '/provisioning-tasks', {
      requestId,
      subscriptionId,
      beneficiaryEmployeeId,
    });
    expect(created.status).toBe(201);
    const taskId = call().data<{ task: { id: string } }>(created).task.id;
    expect((await call().post('NV-ITA1', `/provisioning-tasks/${taskId}/claim`)).status).toBe(200);
    expect(
      (await call().post('NV-ITA1', `/provisioning-tasks/${taskId}/complete`, { evidence: 'Đã thêm vào workspace' }))
        .status,
    ).toBe(200);
  };

  beforeAll(async () => {
    world = await FlowWorld.open();
    jira = await call().planId('Jira Standard');
    figma = await call().planId('Figma Professional');
  }, 300000);

  afterAll(async () => {
    await world?.close();
  });

  it('BR-MF1-02 HEAD_IN_GROUP từ chối trưởng phòng trong nhóm cho cả hai loại người gửi @MF1', async () => {
    const before = await world.facts.count('access_requests');
    const head = await world.facts.employeeId('NV-ENGH');
    const colleague = await world.facts.employeeId('NV-DEV3');
    for (const sender of ['NV-ENGH', 'NV-DEV2']) {
      const response = await call().post(sender, '/group-requests', {
        planId: figma, businessReason: 'Nhóm có trưởng phòng',
        lines: [{ employeeId: head }, { employeeId: colleague }],
      });
      expect(response.status).toBe(422);
      expect(call().codeOf(response)).toBe('GROUP_REQUEST.LINES_REFUSED');
      expect(call().detailsOf(response)).toMatchObject({
        lines: expect.arrayContaining([{ employeeId: head, reason: 'HEAD_IN_GROUP' }]),
      });
    }
    expect(await world.facts.count('access_requests')).toBe(before);
  });

  it('một người không phải nhóm: 422 TOO_FEW_LINES và không ghi gì #19 @B3', async () => {
    const before = await world.facts.count('access_requests');
    const dev2 = await world.facts.employeeId('NV-DEV2');

    const response = await call().post('NV-DEV2', '/group-requests', {
      planId: jira,
      businessReason: 'Một mình',
      lines: [{ employeeId: dev2 }],
    });

    expect(response.status).toBe(422);
    expect(call().codeOf(response)).toBe('GROUP_REQUEST.TOO_FEW_LINES');
    expect(call().detailsOf(response)).toEqual({ min: 2 });
    expect(await world.facts.count('access_requests')).toBe(before);
  });

  it('nhóm hai người do nhân viên gửi đi hết các bước; không client nào gửi ngày; Assignment mang thời hạn của Request #4 #19 #20 @B3', async () => {
    const [dev2, dev3] = [await world.facts.employeeId('NV-DEV2'), await world.facts.employeeId('NV-DEV3')];
    const sent = await call().post('NV-DEV2', '/group-requests', {
      planId: jira,
      businessReason: 'Cả nhóm cần Jira',
      lines: [{ employeeId: dev2 }, { employeeId: dev3 }],
    });
    expect(sent.status).toBe(201);
    const id = idOf(sent);
    expect(await stateOf(id)).toBe('PENDING');

    // The sender is not the head: the line of a colleague shows no end date and no cost.
    const lines = call().data<{ items: { employee: { employeeCode: string }; expectedEndDate: string | null }[] }>(
      await call().get('NV-DEV2', `/access-requests/${id}/lines`),
    );
    expect(lines.items.map((line) => line.employee.employeeCode).sort()).toEqual(['NV-DEV2', 'NV-DEV3']);
    expect(lines.items.every((line) => line.expectedEndDate === null)).toBe(true);

    const needed = await call().post('NV-ENGH', `/access-requests/${id}/line-need-decisions`, {
      lines: [
        { employeeId: dev2, decision: 'APPROVE' },
        { employeeId: dev3, decision: 'APPROVE' },
      ],
    });
    expect(needed.status).toBe(200);
    expect(await stateOf(id)).toBe('AWAITING_SPEND_SUBMISSION');
    expect((await call().submitBatch('NV-ENGH', [id])).status).toBe(201);
    expect(await stateOf(id)).toBe('AWAITING_SPEND_DECISION');
    const decided = await call().post('NV-CEO', `/access-requests/${id}/line-spend-decisions`, {
      lines: [
        { employeeId: dev2, decision: 'APPROVE' },
        { employeeId: dev3, decision: 'APPROVE' },
      ],
    });
    expect(decided.status).toBe(200);
    expect(await stateOf(id)).toBe('AWAITING_EXECUTION');
    expect(await world.facts.count('budget_commitments', 'request_id = $1', [id])).toBe(1);

    const subscription = await call().subscriptionOf('Jira Standard', 'ENG');
    await grantLine(id, subscription, dev2);
    await grantLine(id, subscription, dev3);

    const rows = await world.facts.rows<{ employee_code: string; expected_end_date: string | null }>(
      `SELECT e.employee_code, to_char(a.expected_end_date, 'YYYY-MM-DD') AS expected_end_date
         FROM license_assignments a JOIN employees e ON e.id = a.employee_id
        WHERE a.employee_id = ANY($1::uuid[]) AND a.plan_id = $2 ORDER BY e.employee_code`,
      [[dev2, dev3], jira],
    );
    // R-D01: the group named no end date, so the seats have none (a right has no end unless the sender gives one, QĐ-104a).
    expect(rows).toEqual([
      { employee_code: 'NV-DEV2', expected_end_date: null },
      { employee_code: 'NV-DEV3', expected_end_date: null },
    ]);
    expect(await world.facts.count('provisioning_tasks', "request_id = $1 AND status = 'COMPLETED'", [id])).toBe(2);
  });

  it('nhà thầu được cấp quyền, Assignment có ngày kết thúc = hôm nay + thời hạn − 1 ngày (R1) #20 @B3', async () => {
    const created = await call().post('NV-SA', '/employees', {
      employeeCode: 'NV-CTR1',
      fullName: 'Nguyễn Văn Thầu',
      workEmail: 'thau.nguyen@saoviet.example',
      employmentType: 'CONTRACTOR',
      hireDate: call().today(),
      departmentCode: 'ENG',
      jobTitle: 'Lập trình viên hợp đồng',
    });
    expect(created.status).toBe(201);
    const [contractor, dev1] = [await world.facts.employeeId('NV-CTR1'), await world.facts.employeeId('NV-DEV1')];

    const end = await oneMonthTerm();
    const sent = await call().post('NV-ENGH', '/group-requests', {
      planId: figma,
      businessReason: 'Nhà thầu và một đồng nghiệp cần Figma',
      expectedEndDate: end,
      lines: [{ employeeId: contractor }, { employeeId: dev1 }],
    });
    expect(sent.status).toBe(201);
    const id = idOf(sent);
    // The head sent it: nobody else has a need to confirm, so it waits to be batched at once.
    expect(await stateOf(id)).toBe('AWAITING_SPEND_SUBMISSION');
    expect((await call().submitBatch('NV-ENGH', [id])).status).toBe(201);
    const decided = await call().post('NV-CEO', `/access-requests/${id}/line-spend-decisions`, {
      lines: [
        { employeeId: contractor, decision: 'APPROVE' },
        { employeeId: dev1, decision: 'APPROVE' },
      ],
    });
    expect(decided.status).toBe(200);
    expect(await stateOf(id)).toBe('AWAITING_EXECUTION');

    const subscription = await call().subscriptionOf('Figma Professional', 'ENG');
    await grantLine(id, subscription, contractor);
    await grantLine(id, subscription, dev1);

    const rows = await world.facts.rows<{ employment_type: string; expected_end_date: string | null }>(
      `SELECT e.employment_type::text, to_char(a.expected_end_date, 'YYYY-MM-DD') AS expected_end_date
         FROM license_assignments a JOIN employees e ON e.id = a.employee_id
        WHERE a.employee_id = $1 AND a.plan_id = $2`,
      [contractor, figma],
    );
    expect(rows).toEqual([{ employment_type: 'CONTRACTOR', expected_end_date: end }]);
  });
});
