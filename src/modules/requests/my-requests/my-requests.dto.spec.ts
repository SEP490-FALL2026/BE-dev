import { myRequestSummarySchema, myRequestsQuerySchema } from './my-requests.dto';
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
});
