import { DemoApiError } from '../demo-api-client';
import type { DemoRunContext } from '../demo-run.types';
import type { DemoRequestScenario } from '../fixture/demo-fixture.types';
import { SHARED_DEMO_V4 } from '../fixture/shared-demo-v4';
import {
  assessmentRejectBody,
  assessmentReturnBody,
  grantedBeneficiaries,
  lineSpendBody,
  needBody,
  perform,
  spendBody,
  type RequestWire,
} from './request-actions';
import { findScenarioRequest } from './request.steps';

const CHECKLIST = { policyVersionId: 'v1', answers: [{ itemCode: 'A', answer: 'YES' as const }] };

const scenarioOf = (overrides: Partial<DemoRequestScenario> = {}): DemoRequestScenario => ({
  key: 'R99',
  requester: 'NV-DEV1',
  plan: 'jira-standard',
  termMonths: null,
  target: 'COMPLETED',
  summary: 'x',
  reason: 'x',
  ...overrides,
});

const ctxOf = (overrides: Record<string, unknown> = {}) =>
  ({
    fixture: SHARED_DEMO_V4,
    today: '2026-11-17',
    mode: 'apply',
    superAdminEmail: 'sa@example.test',
    demoPassword: 'pw',
    ...overrides,
  }) as unknown as DemoRunContext;

describe('the bodies of the decisions a scenario takes (T11, S10a)', () => {
  it('sends an approval of the need with its checklist and no reason, and a return or a refusal with a reason that carries the tag', () => {
    expect(needBody(ctxOf(), scenarioOf(), 'APPROVE', CHECKLIST)).toEqual({
      decision: 'APPROVE',
      checklist: CHECKLIST,
    });
    const returned = needBody(ctxOf(), scenarioOf(), 'RETURN', CHECKLIST);
    expect(returned.decision).toBe('RETURN');
    expect(returned.reason?.startsWith('[SV-R99]')).toBe(true);
    expect(needBody(ctxOf(), scenarioOf(), 'REJECT', CHECKLIST).reason?.startsWith('[SV-R99]')).toBe(true);
  });

  it('refuses a proposal as not eligible and points at the plan of the scenario instead', () => {
    const body = assessmentRejectBody(ctxOf(), scenarioOf(), CHECKLIST, 'plan-uuid');

    expect(body).toMatchObject({ decision: 'REJECT', kind: 'NOT_ELIGIBLE', alternativePlanId: 'plan-uuid' });
    expect(body.reason.startsWith('[SV-R99]')).toBe(true);
    expect(assessmentRejectBody(ctxOf(), scenarioOf(), CHECKLIST, undefined)).not.toHaveProperty('alternativePlanId');
  });

  it('sends a proposal back with a reason and no kind of refusal', () => {
    const body = assessmentReturnBody(ctxOf(), scenarioOf(), CHECKLIST);

    expect(body.decision).toBe('RETURN');
    expect(body).not.toHaveProperty('kind');
    expect(body.reason.startsWith('[SV-R99]')).toBe(true);
  });

  it('gives the spending approver a reason for a refusal and for a return, and none for an approval', () => {
    expect(spendBody(ctxOf(), scenarioOf(), 'APPROVE', CHECKLIST)).not.toHaveProperty('reason');
    expect(spendBody(ctxOf(), scenarioOf(), 'REJECT', CHECKLIST).reason?.startsWith('[SV-R99]')).toBe(true);
    expect(spendBody(ctxOf(), scenarioOf(), 'RETURN', CHECKLIST).reason?.startsWith('[SV-R99]')).toBe(true);
  });

  it('refuses the people the scenario names line by line and approves the others', () => {
    const ids = new Map([
      ['NV-BOD1', 'id-1'],
      ['NV-BOD2', 'id-2'],
    ]);
    const body = lineSpendBody(
      ctxOf({ ids: { employees: ids } }),
      scenarioOf({ beneficiaries: ['NV-BOD1', 'NV-BOD2'], rejectedLines: ['NV-BOD2'] }),
      CHECKLIST,
    );

    expect(body.lines[0]).toEqual({ employeeId: 'id-1', decision: 'APPROVE' });
    expect(body.lines[1]).toMatchObject({ employeeId: 'id-2', decision: 'REJECT' });
    expect((body.lines[1] as { reason?: string }).reason?.startsWith('[SV-R99]')).toBe(true);
  });

  it('opens a task of grant for the people who are not refused, and for the one person of a request that names none', () => {
    expect(
      grantedBeneficiaries(scenarioOf({ beneficiaries: ['NV-BOD1', 'NV-BOD2'], rejectedLines: ['NV-BOD2'] })),
    ).toEqual(['NV-BOD1']);
    expect(grantedBeneficiaries(scenarioOf())).toEqual([null]);
  });
});

describe('the actions on a task of grant that fails (T11, C-3)', () => {
  const request = { id: 'req-1', state: 'EXECUTING', department: { code: 'ENG' } } as unknown as RequestWire;

  const run = (status: string, action: 'FAIL_TASK_OPEN' | 'FAIL_TASK_CLOSE') => {
    const calls: string[] = [];
    const call = jest.fn((...[, method, path]: [string, string, string, unknown?]) => {
      calls.push(`${method} ${path}`);
      if (path.startsWith('/provisioning-tasks?')) {
        return Promise.resolve({
          items: [{ id: 't1', kind: 'GRANT', status, requestId: 'req-1' }],
          pagination: { totalPages: 1 },
        });
      }
      return Promise.resolve({});
    });
    const ctx = ctxOf({ api: { call, signIn: jest.fn().mockResolvedValue(undefined) } });

    return { done: perform(ctx, scenarioOf({ target: 'FAILED' }), request, action), calls };
  };

  it('takes the queued task and reports it failed', async () => {
    const { done, calls } = run('QUEUED', 'FAIL_TASK_OPEN');
    await done;

    expect(calls.filter((entry) => entry.startsWith('POST'))).toEqual([
      'POST /provisioning-tasks/t1/claim',
      'POST /provisioning-tasks/t1/report-failure',
    ]);
  });

  it('leaves a task that failed already, as an earlier run left it', async () => {
    const { done, calls } = run('FAILED', 'FAIL_TASK_OPEN');
    await done;

    expect(calls.filter((entry) => entry.startsWith('POST'))).toEqual([]);
  });

  it('closes only the task that failed', async () => {
    const { done, calls } = run('FAILED', 'FAIL_TASK_CLOSE');
    await done;

    expect(calls.filter((entry) => entry.startsWith('POST'))).toEqual(['POST /provisioning-tasks/t1/close-failed']);
  });
});

describe('finding the request of a scenario whose requester can no longer sign in (T11, C-2)', () => {
  it('reads it as the person the scenario names, and never signs the requester in', async () => {
    const signedIn: string[] = [];
    const call = jest.fn((...[email, method, path]: [string, string, string, unknown?]) => {
      if (path.startsWith('/audit-events')) {
        return Promise.resolve({ items: [{ resourceId: 'req-9' }], pagination: { totalPages: 1 } });
      }
      if (method === 'GET' && path === '/access-requests/req-9') {
        if (email.startsWith('hieu.dang')) return Promise.reject(new DemoApiError(method, path, 401, 'AUTH.BLOCKED'));
        return Promise.resolve({ request: { id: 'req-9', state: 'CANCELLED', businessReason: '[SV-R57] x' } });
      }
      return Promise.reject(new Error(`unexpected ${method} ${path}`));
    });
    const signIn = jest.fn((email: string) => {
      signedIn.push(email);
      return Promise.resolve();
    });
    const ctx = ctxOf({
      api: { call, signIn },
      ids: { appUsers: new Map([['NV-DEV7', 'u-7']]), requests: new Map() },
    });
    const scenario = scenarioOf({
      key: 'R57',
      requester: 'NV-DEV7',
      readAs: 'NV-ENGH',
      target: 'PENDING_OR_CANCELLED',
    });

    const found = await findScenarioRequest(ctx, scenario);

    expect(found?.state).toBe('CANCELLED');
    expect(signedIn).toEqual(['cuong.le@saoviet.example']);
  });

  it('creates a REQUEST license lot and imports a key before completing a K4 grant with purchase (W3-28)', async () => {
    const writes: Array<{ method: string; path: string; body: unknown }> = [];
    const call = jest.fn((_email: string, method: string, path: string, body?: unknown) => {
      if (method === 'GET' && path.startsWith('/provisioning-tasks?')) {
        return Promise.resolve({
          items: [{ id: 'task-k4', kind: 'GRANT', status: 'IN_PROGRESS', requestId: 'req-k4' }],
          pagination: { totalPages: 1 },
        });
      }
      if (method === 'GET' && path.startsWith('/license-lots?')) {
        return Promise.resolve({ items: [], pagination: { totalPages: 1 } });
      }
      if (method === 'GET' && path.startsWith('/license-keys?')) {
        const hasImported = writes.some((entry) => entry.path === '/license-lots/lot-req-1/keys');
        return Promise.resolve({
          items: hasImported ? [{ id: 'key-req-1' }] : [],
          pagination: { totalPages: 1 },
        });
      }
      writes.push({ method, path, body });
      if (method === 'POST' && path === '/license-lots') return Promise.resolve({ id: 'lot-req-1' });
      return Promise.resolve({});
    });
    const ctx = ctxOf({
      api: { call, signIn: jest.fn().mockResolvedValue(undefined) },
      ids: {
        plans: new Map([['jetbrains-datagrip', 'plan-datagrip']]),
        lots: new Map(),
      },
    });
    const req = { id: 'req-k4', state: 'EXECUTING', department: { code: 'ITO' } } as unknown as RequestWire;
    await perform(
      ctx,
      scenarioOf({ key: 'R62', plan: 'jetbrains-datagrip', grant: 'PURCHASE', target: 'COMPLETED' }),
      req,
      'COMPLETE_TASK',
    );

    expect(writes).toEqual([
      {
        method: 'POST',
        path: '/license-lots',
        body: {
          planId: 'plan-datagrip',
          purchasedOn: '2026-11-17',
          licenseCount: 1,
          unitPrice: { amount: '3000000', currency: 'VND' },
          purpose: 'REQUEST',
          requestId: 'req-k4',
        },
      },
      {
        method: 'POST',
        path: '/license-lots/lot-req-1/keys',
        body: { keys: ['REQ-R62-7Q2K-X9M4-0001'] },
      },
      {
        method: 'POST',
        path: '/provisioning-tasks/task-k4/complete',
        body: {
          evidence: '[SV-R62] Đã cấp quyền cho người dùng.',
          licenseKeyId: 'key-req-1',
        },
      },
    ]);
    expect(ctx.ids.lots.get('request:R62')).toBe('lot-req-1');
  });

  it('signs nobody in when the requester has sent nothing yet', async () => {
    const signIn = jest.fn();
    const call = jest.fn().mockResolvedValue({ items: [], pagination: { totalPages: 1 } });
    const ctx = ctxOf({ api: { call, signIn }, ids: { appUsers: new Map([['NV-DEV1', 'u-1']]), requests: new Map() } });

    expect(await findScenarioRequest(ctx, scenarioOf())).toBeNull();
    expect(signIn).not.toHaveBeenCalled();
  });
});
