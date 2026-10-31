import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { draftPolicyJson } from './request-draft-policy.json';

const stored = {
  draft: { kind: 'INDIVIDUAL', planId: 'plan-1', businessReason: 'Design the brand', termMonths: 3, tags: ['a', null] },
};

describe('draftPolicyJson (access_requests.policy of a draft)', () => {
  it('reads the content a draft was saved with: its kind and the body beside it', () => {
    expect(draftPolicyJson.decode(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
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
