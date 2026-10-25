import { checkReturnable, checkSender, mayReadReturn, originMatches } from './return-request.policy';

describe('who sends the return of a seat (US-05-13 AC-1, AC-2, AC-5, AC-9)', () => {
  const facts = {
    actorEmployeeId: 'e1',
    holderEmployeeId: 'e1',
    holderDepartmentId: 'd-eng',
    actorHeadedDepartmentId: null as string | null,
  };

  it('lets the holder return their own seat, whether or not their department has a head', () => {
    expect(checkSender(facts)).toEqual({ ok: true, source: 'EMPLOYEE_RETURN' });
    expect(checkSender({ ...facts, holderDepartmentId: null })).toEqual({ ok: true, source: 'EMPLOYEE_RETURN' });
  });

  it('lets a head who is also the holder return their own seat as the holder', () => {
    expect(checkSender({ ...facts, actorHeadedDepartmentId: 'd-eng' })).toEqual({
      ok: true,
      source: 'EMPLOYEE_RETURN',
    });
  });

  it('lets the head of the department of the holder confirm that the seat is no longer needed', () => {
    expect(checkSender({ ...facts, actorEmployeeId: 'h1', actorHeadedDepartmentId: 'd-eng' })).toEqual({
      ok: true,
      source: 'HEAD_CONFIRMATION',
    });
  });

  it('refuses the head of another department apart from a person who is neither the holder nor a head', () => {
    expect(checkSender({ ...facts, actorEmployeeId: 'h2', actorHeadedDepartmentId: 'd-ops' })).toEqual({
      ok: false,
      refusal: 'OUTSIDE_DEPARTMENT',
    });
    expect(checkSender({ ...facts, actorEmployeeId: 'e2' })).toEqual({ ok: false, refusal: 'NOT_HOLDER' });
    // A head of a department when the holder has none is the head of another department.
    expect(
      checkSender({ ...facts, actorEmployeeId: 'h1', actorHeadedDepartmentId: 'd-eng', holderDepartmentId: null }),
    ).toEqual({ ok: false, refusal: 'OUTSIDE_DEPARTMENT' });
  });
});

describe('when a seat may be returned (US-05-13)', () => {
  const returnable = {
    open: true,
    kind: 'PERSONAL' as const,
    provisioningType: 'K2' as const,
    grant: 'COMPLETED' as const,
  };

  it('takes a personal seat that is held, of a plan that has a revocation, whose grant is done or none was needed', () => {
    expect(checkReturnable(returnable)).toBeNull();
    expect(checkReturnable({ ...returnable, grant: 'NONE' })).toBeNull();
    for (const provisioningType of ['K1', 'K2', 'K5'] as const) {
      expect(checkReturnable({ ...returnable, provisioningType })).toBeNull();
    }
  });

  it('gives the first reason it cannot, in the order a person should learn it', () => {
    expect(checkReturnable({ ...returnable, open: false, kind: 'SERVICE', provisioningType: 'K4' })).toBe('NOT_OPEN');
    expect(checkReturnable({ ...returnable, kind: 'SERVICE', provisioningType: 'K4' })).toBe('SERVICE_ACCOUNT');
    expect(checkReturnable({ ...returnable, provisioningType: 'K4', grant: 'NOT_COMPLETED' })).toBe(
      'PLAN_NOT_SUPPORTED',
    );
    expect(checkReturnable({ ...returnable, provisioningType: 'K3' })).toBe('PLAN_NOT_SUPPORTED');
    expect(checkReturnable({ ...returnable, grant: 'NOT_COMPLETED' })).toBe('GRANT_NOT_COMPLETED');
  });
});

describe('the request a return follows (US-05-08, US-05-13)', () => {
  const facts = {
    actorEmployeeId: 'e1',
    request: { state: 'COMPLETED' as const, requesterEmployeeId: 'e1', beneficiaryEmployeeIds: ['e1'] },
    grantRequestId: 'r1',
    fromRequestId: 'r1',
  };

  it('matches a request that is done, that the person has a part in and whose grant made the seat', () => {
    expect(originMatches(facts)).toBe(true);
    expect(
      originMatches({
        ...facts,
        actorEmployeeId: 'e2',
        request: { ...facts.request, requesterEmployeeId: 'h1', beneficiaryEmployeeIds: ['e2'] },
      }),
    ).toBe(true);
  });

  it('does not match one that is missing, not done, made by another grant, or one the person has no part in', () => {
    expect(originMatches({ ...facts, request: null })).toBe(false);
    expect(originMatches({ ...facts, request: { ...facts.request, state: 'EXECUTING' } })).toBe(false);
    expect(originMatches({ ...facts, grantRequestId: 'r2' })).toBe(false);
    expect(originMatches({ ...facts, grantRequestId: null })).toBe(false);
    expect(originMatches({ ...facts, actorEmployeeId: 'e9' })).toBe(false);
  });
});

describe('who reads a return (US-05-13 AC-3)', () => {
  const facts = {
    actorEmployeeId: 'x',
    roles: [] as string[],
    holderEmployeeId: 'e1',
    requestedByEmployeeId: 'h1',
    returnDepartmentId: 'd-eng',
    actorHeadedDepartmentId: null as string | null,
  };

  it('shows it to the holder, the sender, the head of the department and the IT Admin', () => {
    expect(mayReadReturn({ ...facts, actorEmployeeId: 'e1' })).toBe(true);
    expect(mayReadReturn({ ...facts, actorEmployeeId: 'h1' })).toBe(true);
    expect(mayReadReturn({ ...facts, actorHeadedDepartmentId: 'd-eng' })).toBe(true);
    expect(mayReadReturn({ ...facts, roles: ['IT_ADMIN'] })).toBe(true);
  });

  it('hides it from anyone else, whatever else they hold', () => {
    expect(mayReadReturn(facts)).toBe(false);
    expect(mayReadReturn({ ...facts, actorHeadedDepartmentId: 'd-ops', roles: ['FINANCE', 'SUPER_ADMIN'] })).toBe(
      false,
    );
  });
});
