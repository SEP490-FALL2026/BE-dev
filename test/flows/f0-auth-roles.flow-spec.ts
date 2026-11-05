import { SUPER_ADMIN } from '../support/flows/flow-actors';
import { FlowWorld } from '../support/flows/flow-world';
import { FlowClockError } from '../support/flows/flow-clock';

/** The people each role is tested with (spec e2e-main-flows-suite, section 4, test-plan section 1). */
const ROLES: Array<[string, string, string]> = [
  ['an employee', 'NV-DEV3', 'EMPLOYEE'],
  ['a department head', 'NV-ENGH', 'MANAGER'],
  ['an IT Admin', 'NV-ITA1', 'IT_ADMIN'],
  ['the finance officer', 'NV-FIN1', 'FINANCE'],
  ['the spending approver', 'NV-CEO', 'SPENDING_APPROVER'],
  ['the Super Admin', SUPER_ADMIN, 'SUPER_ADMIN'],
];

describe('F0-01 every role signs in and refreshes for real @MF0 @D1', () => {
  let world: FlowWorld;

  beforeAll(async () => {
    world = await FlowWorld.open();
  }, 300000);

  afterAll(async () => {
    await world?.close();
  });

  it.each(ROLES)(
    '%s signs in with the demo password and reads /me with the role of the dataset #B0 @B0',
    async (_name, code, role) => {
      const session = await world.actors.signIn(code);

      expect(session.accessToken).toEqual(expect.any(String));
      expect(Date.parse(session.refreshExpiresAt)).toBeGreaterThan(world.clock.now().getTime());
      const me = world.calls.data<{ roles: string[] }>(await world.calls.get(code, '/me'));
      expect(me.roles).toEqual([role]);
    },
  );

  it('refuses a wrong password and an unknown address with the same answer #B0 @B0', async () => {
    const wrongPassword = await world.calls.anonymous('post', '/auth/login', {
      email: world.actors.emailOf('NV-DEV3'),
      password: 'not the password',
    });
    const unknown = await world.calls.anonymous('post', '/auth/login', {
      email: 'nobody@saoviet.example',
      password: 'not the password',
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(world.calls.codeOf(wrongPassword)).toBe(world.calls.codeOf(unknown));
  });

  /** A route of each role and the people of the other roles, who must be refused before anything is read or written. */
  const ROUTES: Array<[string, 'get' | 'post', string, string[], string[]]> = [
    [
      'the Super Admin and the IT Admin read the offboarding cases',
      'get',
      '/offboarding-cases',
      [SUPER_ADMIN, 'NV-ITA1'],
      ['NV-DEV3', 'NV-ENGH', 'NV-FIN1', 'NV-CEO'],
    ],
    [
      'only the Super Admin records a departure',
      'post',
      '/offboarding-cases',
      [SUPER_ADMIN],
      ['NV-DEV3', 'NV-ENGH', 'NV-ITA1', 'NV-FIN1', 'NV-CEO'],
    ],
    [
      'only Finance builds a budget version',
      'post',
      '/budget-versions',
      ['NV-FIN1'],
      ['NV-DEV3', 'NV-ENGH', 'NV-ITA1', 'NV-CEO', SUPER_ADMIN],
    ],
    [
      'only the IT Admin proposes a renewal',
      'post',
      '/subscription-renewals',
      ['NV-ITA1'],
      ['NV-DEV3', 'NV-ENGH', 'NV-FIN1', 'NV-CEO', SUPER_ADMIN],
    ],
  ];

  it.each(ROUTES)('%s: the other roles are refused with 403 #B0 @B0', async (_name, method, path, allowed, refused) => {
    await world.actors.ensure(...allowed, ...refused);

    for (const code of refused) {
      const response = await world.calls[method](code, path, ...(method === 'post' ? [{}] : []));
      expect([code, response.status]).toEqual([code, 403]);
      expect(world.calls.codeOf(response)).toBe('AUTHORIZATION.FORBIDDEN');
    }
    for (const code of allowed) {
      const response = await world.calls[method](code, path, ...(method === 'post' ? [{}] : []));
      expect([code, response.status === 403]).toEqual([code, false]);
    }
  });

  it('refuses the sign-in of an account that is invited and not activated, like a wrong password #B0 @B0', async () => {
    await world.actors.ensure(SUPER_ADMIN);
    const employeeId = await world.facts.employeeId('NV-NEW1');
    const created = await world.calls.post(SUPER_ADMIN, '/app-users', { employeeId });
    expect(created.status).toBe(201);
    expect(
      (
        await world.facts.one<{ activation_state: string }>(
          `SELECT activation_state::text FROM app_users WHERE employee_id = $1`,
          [employeeId],
        )
      ).activation_state,
    ).toBe('INVITED');
    const email = (
      await world.facts.one<{ work_email: string }>(`SELECT work_email FROM employees WHERE id = $1`, [employeeId])
    ).work_email;

    const invited = await world.calls.anonymous('post', '/auth/login', { email, password: 'Anything-1234567' });
    const wrong = await world.calls.anonymous('post', '/auth/login', {
      email: world.actors.emailOf('NV-DEV3'),
      password: 'Anything-1234567',
    });

    expect(invited.status).toBe(401);
    expect(world.calls.codeOf(invited)).toBe(world.calls.codeOf(wrong));
  });

  it('rotates the refresh token: the new one works and the old one is refused #B0 @B0', async () => {
    await world.actors.ensure('NV-DEV3');
    const before = await world.actors.session('NV-DEV3');

    const refreshed = await world.actors.refresh('NV-DEV3').expect(200);
    const after = world.actors.keep('NV-DEV3', refreshed);

    expect(after.refreshToken).not.toBe(before.refreshToken);
    expect((await world.calls.get('NV-DEV3', '/me')).status).toBe(200);
    // Presenting the old token again is a replay: it is refused and the session it belongs to is revoked with it.
    expect((await world.actors.refresh('NV-DEV3', before.refreshToken)).status).toBe(401);
    expect((await world.calls.get('NV-DEV3', '/me')).status).toBe(401);
    await world.actors.signIn('NV-DEV3');
    expect((await world.calls.get('NV-DEV3', '/me')).status).toBe(200);
  });

  it('lets a session lapse over a jump of the clock past its refresh window, and a new sign-in works again #B0 @B0', async () => {
    await world.actors.signIn('NV-DEV3');
    const session = await world.actors.session('NV-DEV3');

    world.clock.jumpDays(2);

    expect(world.clock.now().getTime()).toBeGreaterThan(Date.parse(session.refreshExpiresAt));
    expect((await world.actors.refresh('NV-DEV3')).status).toBe(401);
    await world.actors.signIn('NV-DEV3');
    expect((await world.calls.get('NV-DEV3', '/me')).status).toBe(200);
  });

  it('refuses to move the clock backwards before it calls anything #B0 @B0', () => {
    const today = world.clock.today();

    expect(() => world.clock.jumpTo(world.clock.inDays(-1))).toThrow(FlowClockError);
    expect(world.clock.today()).toBe(today);
  });

  it('runs no pass by itself: only the ones the scenario calls leave a trace of the system #B0 @B0', async () => {
    const before = await world.facts.count('audit_events', "actor_kind = 'SYSTEM'");

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(await world.facts.count('audit_events', "actor_kind = 'SYSTEM'")).toBe(before);
  });
});
