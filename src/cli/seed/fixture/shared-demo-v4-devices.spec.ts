import { SHARED_DEMO_V4 as F } from './shared-demo-v4';

const plan = (key: string) => F.applications.flatMap((app) => app.plans).find((candidate) => candidate.key === key)!;
const person = (code: string) => F.people.find((candidate) => candidate.code === code)!;

/** Redesign wave 2, W2-25: the dataset enters the machines and the software bought per machine the way the new rules take them. */
describe('shared dataset v4: the company machines and their software (W2-25)', () => {
  it('bundles Windows 11 Pro OEM with every laptop: a plan bound to the machine, with no purchase, no price and no console', () => {
    const windows = plan('windows-11-pro-oem');
    expect(windows).toMatchObject({ provisioningType: 'K4', keyBinding: 'DEVICE_BUNDLED' });
    expect(windows.referencePrice).toBeUndefined();
    expect(windows.hasAdminConsole).toBeUndefined();
    expect(F.subscriptions.some((subscription) => subscription.plan === windows.key)).toBe(false);
    for (const machine of [...F.devices, ...F.newDevices]) expect(machine.bundled).toEqual([windows.key]);
  });

  it('buys 25 licenses of Office LTSC 2024 once, on one key of 30 activations that already ran 8 times, plans bound to an account staying as they are', () => {
    expect(plan('office-ltsc-2024')).toMatchObject({ provisioningType: 'K4', keyBinding: 'DEVICE_KEY' });
    expect(F.subscriptions.find((subscription) => subscription.plan === 'office-ltsc-2024')).toMatchObject({
      kind: 'PERPETUAL',
      quantity: 25,
    });
    expect(F.keys.find((keys) => keys.subscription === 'office-ltsc-2024')).toEqual({
      subscription: 'office-ltsc-2024',
      count: 1,
      maxActivations: 30,
      initialActivationsUsed: 8,
    });
    for (const keys of F.keys.filter((candidate) => candidate.subscription !== 'office-ltsc-2024')) {
      expect(plan(F.subscriptions.find((s) => s.key === keys.subscription)!.plan).keyBinding).toBeUndefined();
      expect(keys.initialActivationsUsed).toBeUndefined();
    }
  });

  it('ends with 12 activations used and 10 open on the Office key: 8 told at import plus 4 on new machines, 6 old machines and 4 new ones running it', () => {
    const key = F.keys.find((keys) => keys.subscription === 'office-ltsc-2024')!;
    const initialRows = F.devices.filter((machine) => machine.initialKeyOf === 'office-ltsc-2024');
    const operationRows = F.newDevices.filter((machine) => machine.keyOf === 'office-ltsc-2024');

    expect(key.initialActivationsUsed! + operationRows.length).toBe(12);
    expect(initialRows.length + operationRows.length).toBe(10);
    expect(initialRows.length).toBeLessThanOrEqual(key.initialActivationsUsed!);
    expect(key.maxActivations).toBeGreaterThanOrEqual(12);
    // The machine taken out of use runs nothing: its activations would be closed with it.
    expect(F.devices.find((machine) => machine.retire)!.initialKeyOf).toBeUndefined();
  });

  it('gives the seven old machines their own code, kind and serial number, all different, the new ones a serial number and no code', () => {
    expect(new Set(F.devices.map(({ serialNumber }) => serialNumber)).size).toBe(7);
    for (const machine of F.devices) expect(machine).toMatchObject({ deviceType: 'LAP' });
    const serials = [...F.devices, ...F.newDevices].map(({ serialNumber }) => serialNumber);
    expect(new Set(serials).size).toBe(serials.length);
    expect(new Set(F.newDevices.map(({ hostname }) => hostname)).size).toBe(F.newDevices.length);
    for (const machine of F.newDevices) expect(machine).not.toHaveProperty('assetCode');
  });

  it('adds two machines in the stock (one running Office), a broken machine still held, and a machine for each of the two people who leave', () => {
    const inStock = F.newDevices.filter((machine) => machine.holder === undefined);
    expect(inStock).toHaveLength(2);
    expect(inStock.filter((machine) => machine.keyOf)).toHaveLength(1);
    const broken = F.newDevices.filter((machine) => machine.condition === 'BROKEN');
    expect(broken).toHaveLength(1);
    expect(broken[0].holder).toBeDefined();
    const leaving = F.personnel.filter((event) => event.kind === 'OFFBOARDING').map((event) => event.employee);
    for (const code of ['NV-ITA4', 'NV-OFF1']) {
      expect(leaving).toContain(code);
      expect(F.newDevices.filter((machine) => machine.holder === code)).toHaveLength(1);
    }
    for (const machine of F.newDevices.filter((candidate) => candidate.holder)) {
      expect(person(machine.holder!).account).not.toBeNull();
    }
  });

  it('names an IT Admin who works to stand in for the department of the IT Admin who leaves, and who is not the one in charge of it', () => {
    expect(F.departmentSubstitutes).toHaveLength(1);
    const [substitute] = F.departmentSubstitutes;
    expect(substitute.department).toBe(person('NV-ITA4').department);
    expect(person(substitute.substitute).account).toBe('IT_ADMIN');
    expect(substitute.substitute).not.toBe(F.departments.find(({ code }) => code === substitute.department)!.itAdmin);
    expect(substitute.substitute).not.toBe('NV-ITA4');
    expect(substitute.reason.length).toBeGreaterThan(0);
    expect(substitute.reason.length).toBeLessThanOrEqual(500);
  });
});
