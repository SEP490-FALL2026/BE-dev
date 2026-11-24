import { emptyIds, type DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 as fixture } from '../fixture/shared-demo-v4';
import { NEW_DEVICE_STEPS } from './device-new.steps';

type Row = { id: string; assetCode: string; serialNumber: string | null; condition: string };

const step = NEW_DEVICE_STEPS[0];

/** A registry that answers like the API: a list searched by name, a create that gives the machine a code, activations by machine. */
function fakeApi() {
  const rows: Row[] = [];
  const activations: string[] = [];
  const hostnames = new Map<string, string>();
  const writes: { email: string; method: string; path: string; body: unknown }[] = [];
  const respond = (email: string, method: string, path: string, body?: unknown): unknown => {
    if (method === 'GET' && path.startsWith('/devices?search=')) {
      const hostname = decodeURIComponent(path.split('search=')[1].split('&')[0]);
      return { items: rows.filter((row) => hostnames.get(row.id) === hostname), pagination: { totalPages: 1 } };
    }
    if (method === 'GET' && path.startsWith('/license-keys?')) {
      return { items: [{ id: 'key-office' }], pagination: { totalPages: 1 } };
    }
    if (method === 'GET' && path.startsWith('/device-activations?')) {
      const deviceId = path.split('deviceId=')[1].split('&')[0];
      return {
        items: activations.filter((id) => id === deviceId).map(() => ({ plan: { id: 'plan-office' } })),
        pagination: { totalPages: 1 },
      };
    }
    writes.push({ email, method, path, body });
    if (method === 'POST' && path === '/devices') {
      const input = body as { hostname: string; serialNumber: string };
      const id = `device-${rows.length + 1}`;
      hostnames.set(id, input.hostname);
      rows.push({
        id,
        assetCode: `LAP-26-000${rows.length + 1}`,
        serialNumber: input.serialNumber,
        condition: 'USABLE',
      });
    }
    if (method === 'POST' && path.endsWith('/activations')) activations.push(path.split('/')[2]);
    if (method === 'POST' && path.endsWith('/condition-changes')) {
      const row = rows.find(({ id }) => id === path.split('/')[2])!;
      row.condition = (body as { condition: string }).condition;
    }
    return {};
  };
  const call = jest.fn((email: string, method: string, path: string, body?: unknown) =>
    Promise.resolve(respond(email, method, path, body)),
  );

  return { call, writes, rows, signIn: jest.fn().mockResolvedValue(undefined) };
}

function context(api: ReturnType<typeof fakeApi>, mode: 'apply' | 'plan' = 'apply'): DemoRunContext {
  const ids = emptyIds();
  for (const person of fixture.people) ids.employees.set(person.code, `employee-${person.code}`);
  ids.plans.set('windows-11-pro-oem', 'plan-windows');
  ids.plans.set('office-ltsc-2024', 'plan-office');
  ids.subscriptions.set('office-ltsc-2024', 'subscription-office');

  return { fixture, ids, mode, demoPassword: 'x', api } as unknown as DemoRunContext;
}

describe('the machines bought after the baseline (W2-25)', () => {
  it('enters the five machines with their bundled Windows, and hands a machine to its holder only when the fixture names one', async () => {
    const api = fakeApi();

    await expect(step.run(context(api))).resolves.toMatchObject({ status: 'done' });

    const created = api.writes
      .filter(({ path }) => path === '/devices')
      .map(({ body }) => body as Record<string, unknown>);
    expect(created.map((body) => body.hostname)).toEqual(fixture.newDevices.map(({ hostname }) => hostname));
    for (const body of created) {
      expect(body).toMatchObject({ deviceType: 'LAP', os: 'Windows 11', bundledPlanIds: ['plan-windows'] });
      expect(body).not.toHaveProperty('assetCode');
    }
    const inStock = created.filter((body) => body.holderEmployeeId === undefined);
    expect(inStock.map((body) => body.hostname)).toEqual(['SV-NEW-0001', 'SV-NEW-0002']);
    expect(created.find((body) => body.hostname === 'SV-NEW-0004')).toMatchObject({
      holderEmployeeId: 'employee-NV-ITA4',
      collectorInstalled: false,
    });
  });

  it('is entered by the IT Admin of the department of the holder, any IT Admin for a machine in stock', async () => {
    const api = fakeApi();

    await step.run(context(api));

    const emailOfAdmin = (hostname: string) =>
      api.writes.find(({ path, body }) => path === '/devices' && (body as { hostname: string }).hostname === hostname)!
        .email;
    const departmentOf = (code: string) => fixture.people.find((person) => person.code === code)!.department;
    const adminOf = (code: string) =>
      fixture.departments.find(({ code: dept }) => dept === departmentOf(code))!.itAdmin;
    const emailOf = (code: string) =>
      `${fixture.people.find((person) => person.code === code)!.email}@${fixture.emailDomain}`;
    expect(emailOfAdmin('SV-NEW-0004')).toBe(emailOf(adminOf('NV-ITA4')!));
    expect(emailOfAdmin('SV-NEW-0005')).toBe(emailOf(adminOf('NV-OFF1')!));
    expect(emailOfAdmin('SV-NEW-0001')).toBe(emailOf(fixture.departments[0].itAdmin!));
  });

  it('runs the Office key on four machines while they are usable, and only then breaks the one that is broken', async () => {
    const api = fakeApi();

    await step.run(context(api));

    const activations = api.writes.filter(({ path }) => path.endsWith('/activations'));
    expect(activations).toHaveLength(4);
    for (const { body } of activations) expect(body).toEqual({ planId: 'plan-office', licenseKeyId: 'key-office' });
    const order = api.writes.map(({ path }) => path);
    const broken = api.writes.findIndex(({ path }) => path.endsWith('/condition-changes'));
    expect(api.writes[broken].body).toMatchObject({ condition: 'BROKEN' });
    // The machine that breaks is the third one entered (SV-NEW-0003): it runs the key first, and a broken machine takes none.
    expect(api.writes[broken].path).toBe('/devices/device-3/condition-changes');
    expect(order.indexOf('/devices/device-3/activations')).toBeGreaterThan(-1);
    expect(order.indexOf('/devices/device-3/activations')).toBeLessThan(broken);
  });

  it('writes nothing on a second run (a machine is told by its serial number, not by a code the system gave)', async () => {
    const api = fakeApi();
    await step.run(context(api));
    api.writes.length = 0;

    await expect(step.run(context(api))).resolves.toMatchObject({ status: 'present' });

    expect(api.writes).toEqual([]);
    expect(api.rows).toHaveLength(5);
  });

  it('writes nothing in a plan run', async () => {
    const api = fakeApi();

    await expect(step.run(context(api, 'plan'))).resolves.toMatchObject({ status: 'planned' });

    expect(api.writes).toEqual([]);
  });

  it('reports a conflict when the store has no key to run', async () => {
    const api = fakeApi();
    api.call.mockImplementation((_email: string, method: string) =>
      Promise.resolve(method === 'GET' ? { items: [], pagination: { totalPages: 1 } } : {}),
    );
    const ctx = context(api);

    const outcome = await step.run(ctx);

    expect(outcome.status).toBe('conflict');
  });
});
