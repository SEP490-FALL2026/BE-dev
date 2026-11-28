import { myRequestItemSchema, myRequestSummarySchema, myRequestsQuerySchema } from './my-requests.dto';
import { requestSchema } from '../access-request/access-request.dto';

describe('the query of my requests', () => {
  it('has a page of 20 from the first when it is empty, and narrows by nothing', () => {
    expect(myRequestsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('reads every narrowing it has', () => {
    const parsed = myRequestsQuerySchema.parse({
      page: '2',
      pageSize: '100',
      view: 'open',
      state: 'PENDING,AWAITING_SPEND_DECISION',
      type: 'GROUP_GRANT',
      from: '2026-10-01T00:00:00Z',
      to: '2026-11-01T00:00:00Z',
    });

    expect(parsed).toMatchObject({ page: 2, pageSize: 100, view: 'open', type: 'GROUP_GRANT' });
  });

  it.each([
    ['a parameter that names a person', { employeeId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11' }],
    ['a requester', { requesterId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11' }],
    ['a page of 0', { page: 0 }],
    ['a page size of 101', { pageSize: 101 }],
    ['a page size of 0', { pageSize: 0 }],
    ['a view that is neither group', { view: 'all' }],
    ['a draft among the states', { state: 'DRAFT' }],
    ['a state that does not exist', { state: 'PENDING,GONE' }],
    ['a type that does not exist', { type: 'RETURN' }],
    ['a moment that is not one', { from: 'yesterday' }],
    ['a window that ends before it begins', { from: '2026-11-01T00:00:00Z', to: '2026-10-01T00:00:00Z' }],
    ['a window of no length', { from: '2026-11-01T00:00:00Z', to: '2026-11-01T00:00:00Z' }],
  ])('refuses %s', (_name, query) => {
    expect(myRequestsQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('a row of my requests', () => {
  it('uses the enums of the request itself, so the list never invents a state, a type or a stage', () => {
    const row = myRequestSummarySchema.shape;
    const spend = requestSchema.shape.spend.unwrap().shape.stage.options;

    expect(row.state.options).toEqual(requestSchema.shape.state.options);
    expect(row.type.options).toEqual(requestSchema.shape.type.options);
    expect(row.spend.unwrap().shape.stage.options).toEqual(spend);
    expect(row.needStep.shape.state.options).toEqual(requestSchema.shape.needStep.shape.state.options);
  });

  it('has none of the fields of money, budget or a standard set, and no list inside the row', () => {
    const keys = JSON.stringify(Object.keys(myRequestSummarySchema.shape));

    expect(keys).not.toMatch(/pricing|amount|price|cost|budget|commitment|check|standard|toolset|businessReason/i);
    expect(Object.keys(myRequestSummarySchema.shape.spend.unwrap().shape)).toEqual(['stage']);
  });

  it('adds nullable ticketRef to list items for standalone requests and ticket items', () => {
    const ticketId = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d99';
    const item = {
      id: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11',
      type: 'GRANT',
      branch: 'PAID_IN_CATALOG',
      state: 'PENDING',
      routing: { mode: 'VIA_HEAD', oneStepReason: null },
      plan: {
        planId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d13',
        planName: 'Business',
        applicationId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d14',
        applicationName: 'Figma',
      },
      softwareName: null,
      beneficiary: {
        employeeId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d12',
        employeeCode: 'E-12',
        fullName: 'Linh Tran',
      },
      lineCount: 1,
      termMonths: 6,
      expectedEndDate: null,
      submittedAt: '2026-10-30T02:00:00.000Z',
      updatedAt: '2026-10-30T02:00:00.000Z',
      needStep: { state: 'PENDING', assignee: null, waitingReason: null },
      spend: null,
      outcome: null,
      withdrawal: null,
      canWithdraw: true,
      involvement: 'SENT',
      myLine: null,
    };

    expect(myRequestItemSchema.parse({ ...item, ticketRef: null }).ticketRef).toBeNull();
    expect(
      myRequestItemSchema.parse({ ...item, ticketRef: { id: ticketId, position: 2, itemCount: 3 } }).ticketRef,
    ).toEqual({ id: ticketId, position: 2, itemCount: 3 });
    expect(
      myRequestItemSchema.safeParse({ ...item, ticketRef: { id: ticketId, position: 7, itemCount: 3 } }).success,
    ).toBe(false);
    expect(JSON.stringify(Object.keys(myRequestItemSchema.shape))).not.toMatch(
      /pricing|amount|price|cost|budget|commitment|check|standard|toolset|businessReason/i,
    );
  });
});
