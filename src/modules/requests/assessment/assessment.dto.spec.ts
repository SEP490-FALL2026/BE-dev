import { catalogLinkBodySchema, proposalBodySchema } from './assessment.dto';

const body = {
  softwareName: 'ChatGPT Business',
  homepageUrl: 'https://chatgpt.com',
  purpose: 'Drafting support replies',
  dataDescription: 'Customer questions, no personal data',
  expectedUsers: 4,
};
const APPLICATION = '0b1d5e0e-6f55-4b3c-8d0e-0a4a8f3a0a11';

describe('the proposal body: software that is not in the catalog, or a plan the catalog lacks of software it has', () => {
  it('takes the declaration alone: the software is new (case B)', () => {
    expect(proposalBodySchema.safeParse(body).success).toBe(true);
  });

  it('takes the application of the catalog with the plan asked for: only the plan is new (case B, short)', () => {
    const parsed = proposalBodySchema.safeParse({
      ...body,
      existingApplicationId: APPLICATION,
      plannedPlanName: '  Business  ',
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ existingApplicationId: APPLICATION, plannedPlanName: 'Business' });
  });

  it.each([
    ['the application without the plan', { existingApplicationId: APPLICATION }, 'plannedPlanName'],
    ['the plan without the application', { plannedPlanName: 'Business' }, 'existingApplicationId'],
  ])('refuses %s, naming the one that is missing', (_name, extra, missing) => {
    const parsed = proposalBodySchema.safeParse({ ...body, ...extra });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join('.'))).toEqual([missing]);
  });

  it.each([
    ['an application that is not an id', { existingApplicationId: 'chatgpt', plannedPlanName: 'Business' }],
    ['a blank plan name', { existingApplicationId: APPLICATION, plannedPlanName: '   ' }],
    ['a plan name over 200 characters', { existingApplicationId: APPLICATION, plannedPlanName: 'x'.repeat(201) }],
  ])('refuses %s', (_name, extra) => {
    expect(proposalBodySchema.safeParse({ ...body, ...extra }).success).toBe(false);
  });
});

describe('the catalog link body: the plan, and whether the software also goes into the list of the department (QĐ-111c)', () => {
  const PLAN = '7c1d5e0e-6f55-4b3c-8d0e-0a4a8f3a0a22';

  it('takes the plan alone, as it always did: nothing is listed', () => {
    expect(catalogLinkBodySchema.parse({ planId: PLAN })).toEqual({ planId: PLAN });
  });

  it('takes the tick, true or false', () => {
    expect(catalogLinkBodySchema.parse({ planId: PLAN, addToDepartmentList: true })).toEqual({
      planId: PLAN,
      addToDepartmentList: true,
    });
    expect(catalogLinkBodySchema.safeParse({ planId: PLAN, addToDepartmentList: false }).success).toBe(true);
  });

  it('refuses a tick that is not a boolean and a field it does not know', () => {
    expect(catalogLinkBodySchema.safeParse({ planId: PLAN, addToDepartmentList: 'yes' }).success).toBe(false);
    expect(catalogLinkBodySchema.safeParse({ planId: PLAN, departmentId: APPLICATION }).success).toBe(false);
  });
});
