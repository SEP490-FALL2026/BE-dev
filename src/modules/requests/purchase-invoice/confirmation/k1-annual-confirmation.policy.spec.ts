import { resolveK1AnnualMonthAllocations } from './k1-annual-confirmation.policy';

describe('k1-annual-confirmation.policy', () => {
  it('returns undefined when no transfer replacement occurred and chargedCostCenterId exists', () => {
    expect(
      resolveK1AnnualMonthAllocations({
        serviceMonth: '2026-11-01',
        segments: [
          {
            assignmentId: 'a-1',
            requestId: 'req-1',
            owningDepartmentId: 'dept-a',
            billingAnchorOn: '2026-11-05',
            endedOn: null,
            replacedFromAssignmentId: null,
          },
        ],
        costCenterByDepartment: new Map([['dept-a', 'cc-a']]),
        fallbackCostCenterId: 'cc-a',
        primaryRequestId: 'req-1',
      }),
    ).toBeUndefined();
  });

  it('assigns old CC before k1RemainingBillingStart and new CC from transfer month onward', () => {
    const allocations = resolveK1AnnualMonthAllocations({
      serviceMonth: '2026-11-01',
      segments: [
        {
          assignmentId: 'a-1',
          requestId: 'req-1',
          owningDepartmentId: 'dept-a',
          billingAnchorOn: '2026-11-05',
          endedOn: '2027-03-20',
          replacedFromAssignmentId: null,
        },
        {
          assignmentId: 'a-2',
          requestId: 'req-2',
          owningDepartmentId: 'dept-b',
          billingAnchorOn: '2026-11-05',
          endedOn: null,
          replacedFromAssignmentId: 'a-1',
        },
      ],
      costCenterByDepartment: new Map([
        ['dept-a', 'cc-a'],
        ['dept-b', 'cc-b'],
      ]),
      fallbackCostCenterId: 'cc-a',
      primaryRequestId: 'req-1',
    });

    expect(allocations).toHaveLength(12);
    expect(allocations?.slice(0, 5).every((a) => a.costCenterId === 'cc-a' && a.requestId === 'req-1')).toBe(true);
    expect(allocations?.slice(5).every((a) => a.costCenterId === 'cc-b' && a.requestId === 'req-2')).toBe(true);
    expect(allocations?.[4]?.month).toBe('2027-03-01');
    expect(allocations?.[5]?.month).toBe('2027-04-01');
  });
});
