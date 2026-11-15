import { policyContentJson } from '../library/library.json';
import { INITIAL_CHANGE_NOTE, INITIAL_POLICIES } from './initial-policies.policy';

const byCode = (code: string) => {
  const policy = INITIAL_POLICIES.find((candidate) => candidate.code === code);
  if (!policy) throw new Error(`no initial policy ${code}`);

  return policy;
};

describe('the initial set of policies (QĐ-112b, POLICY-SEED-DRAFT)', () => {
  it('is the eight approved policies, each once', () => {
    expect(INITIAL_POLICIES.map((policy) => policy.code).sort()).toEqual(
      ['POL-GEN', 'POL-MF1', 'POL-MF2', 'POL-MF3', 'POL-MF4', 'POL-MF5', 'POL-SAAS', 'POL-USAGE'].sort(),
    );
  });

  it.each(INITIAL_POLICIES.map((policy) => [policy.code, policy] as const))(
    'reads %s through the codec of the content, so no step or item code repeats and no list is empty',
    (_code, policy) => {
      expect(() => policyContentJson.decode(policyContentJson.encode(policy.content))).not.toThrow();
      expect(policy.title.length).toBeGreaterThan(0);
      expect(policy.applicableRoles.length).toBeGreaterThan(0);
      expect(policy.applicableRoles).not.toContain('SUPER_ADMIN');
    },
  );

  it('has the seven decision steps of QĐ-111ap and no others, each in the policy of its flow', () => {
    const steps = INITIAL_POLICIES.flatMap((policy) =>
      policy.content.steps.map((step) => `${policy.code}:${step.code}`),
    );

    expect(steps.sort()).toEqual(
      [
        'POL-MF1:1.2',
        'POL-MF1:1.6',
        'POL-MF1:1.7',
        'POL-MF4:4.7',
        'POL-MF5:5.4',
        'POL-SAAS:1.3',
        'POL-USAGE:5.3',
      ].sort(),
    );
  });

  it('asks nothing of a person in the three policies that are only read', () => {
    for (const code of ['POL-GEN', 'POL-MF2', 'POL-MF3']) expect(byCode(code).content.steps).toEqual([]);
  });

  it('names the roles of the approved table', () => {
    expect(byCode('POL-GEN').applicableRoles.sort()).toEqual(
      ['EMPLOYEE', 'FINANCE', 'IT_ADMIN', 'MANAGER', 'SPENDING_APPROVER'].sort(),
    );
    expect(byCode('POL-USAGE').applicableRoles.sort()).toEqual(['IT_ADMIN', 'MANAGER']);
    expect(byCode('POL-SAAS').applicableRoles.sort()).toEqual(['FINANCE', 'IT_ADMIN']);
  });

  it('gives every step at least one question the person answers', () => {
    for (const policy of INITIAL_POLICIES) {
      for (const step of policy.content.steps) {
        expect(step.checklist.some((item) => item.check === 'PERSON')).toBe(true);
      }
    }
  });

  it('has a ground of issue for version one', () => {
    expect(INITIAL_CHANGE_NOTE.trim().length).toBeGreaterThan(10);
  });
});
