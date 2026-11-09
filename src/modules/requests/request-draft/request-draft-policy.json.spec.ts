import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { contentOf } from '../draft/request-draft-content.mapper';
import { draftPolicyJson } from './request-draft-policy.json';

const stored = {
  draft: { kind: 'INDIVIDUAL', planId: 'plan-1', businessReason: 'Design the brand', termMonths: 3, tags: ['a', null] },
};

describe('draftPolicyJson (access_requests.policy of a draft)', () => {
  it('reads the content a draft was saved with: its kind and the body beside it', () => {
    expect(draftPolicyJson.decode(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
  });

  it('reads an old draft without forwarding the retired project label or the retired term in months (QĐ-104a)', () => {
    const policy = {
      draft: {
        kind: 'INDIVIDUAL',
        planId: '8a4d7c1e-2b3f-4c5d-9e6f-0a1b2c3d4e5f',
        businessReason: 'Work',
        termMonths: 3,
        projectLabel: 'old',
      },
    };
    expect(contentOf({ id: 'draft-1', policy })).toEqual({
      kind: 'INDIVIDUAL',
      body: { planId: policy.draft.planId, businessReason: 'Work' },
    });
    expect(policy.draft.projectLabel).toBe('old');
  });

  it.each([
    ['a missing draft', {}],
    ['a draft with no kind', { draft: { planId: 'plan-1' } }],
    ['a kind that is a number', { draft: { kind: 7 } }],
    ['a body with a value that is not JSON', { draft: { kind: 'GROUP', when: new Date() } }],
    [
      'a request that was sent: the policy of a request, not a draft',
      { version: 1, branch: 'INTERNAL_FREE', chain: [] },
    ],
    ['null', null],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => draftPolicyJson.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => draftPolicyJson.decode(value)).toThrow('access_requests.policy');
    expect(() => draftPolicyJson.decode(value)).not.toThrow(/plan-1|INTERNAL_FREE/);
  });

  it('writes the content as it has always been written: `{ draft: { kind, ...body } }`', () => {
    expect(draftPolicyJson.encode(stored)).toEqual({
      draft: {
        kind: 'INDIVIDUAL',
        planId: 'plan-1',
        businessReason: 'Design the brand',
        termMonths: 3,
        tags: ['a', null],
      },
    });
  });
});
