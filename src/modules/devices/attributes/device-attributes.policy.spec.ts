import { DeviceNotEditableError, DeviceUpdateEmptyError } from './device-attributes.errors';
import { assertEditable, assertSomethingGiven, changesOf, normalizedSerialOf } from './device-attributes.policy';

const current = {
  hostname: 'LT-0004',
  os: 'Windows 11',
  serialNumber: 'SN-123' as string | null,
  deviceType: 'PC' as const,
};

describe('assertSomethingGiven', () => {
  it('refuses an update that names no field to change', () => {
    expect(() => assertSomethingGiven({})).toThrow(DeviceUpdateEmptyError);
  });

  it.each([
    { hostname: 'x' },
    { os: 'x' },
    { deviceType: 'LAP' },
    { serialNumber: 'SN-1' },
    { serialNumber: null },
  ] as const)('accepts an update that names %j (a serial number of null clears it)', (input) => {
    expect(() => assertSomethingGiven(input)).not.toThrow();
  });
});

describe('assertEditable', () => {
  it('lets a machine in the register be corrected, held or not', () => {
    expect(() => assertEditable({ retiredAt: null, voidedAt: null })).not.toThrow();
  });

  it('refuses a machine taken out of use and a record that was voided, saying which', () => {
    expect(() => assertEditable({ retiredAt: new Date(), voidedAt: null })).toThrow(DeviceNotEditableError);
    expect(() => assertEditable({ retiredAt: null, voidedAt: new Date() })).toThrow(DeviceNotEditableError);
    try {
      assertEditable({ retiredAt: null, voidedAt: new Date() });
    } catch (error) {
      expect((error as DeviceNotEditableError).reason).toBe('VOIDED');
    }
  });
});

describe('changesOf', () => {
  it('keeps only the fields that differ from what the machine has', () => {
    expect(changesOf(current, { hostname: 'LT-0004', os: 'Windows 10', deviceType: 'PC' })).toEqual({
      os: 'Windows 10',
    });
  });

  it('is empty when nothing differs, so the update changes and audits nothing', () => {
    expect(changesOf(current, { hostname: 'LT-0004', serialNumber: 'SN-123' })).toEqual({});
  });

  it('takes the kind of machine, and the serial number cleared by null', () => {
    expect(changesOf(current, { deviceType: 'LAP' })).toEqual({ deviceType: 'LAP' });
    expect(changesOf(current, { serialNumber: null })).toEqual({ serialNumber: null });
    expect(changesOf({ ...current, serialNumber: null }, { serialNumber: null })).toEqual({});
  });
});

describe('normalizedSerialOf', () => {
  it('is the search key of the serial number, as the asset code has one: case, accents and runs of blanks do not tell two serials apart', () => {
    expect(normalizedSerialOf('Sn  123')).toBe(normalizedSerialOf('SN 123'));
    expect(normalizedSerialOf(' sn-123 ')).toBe(normalizedSerialOf('SN-123'));
  });

  it('is null for no serial number', () => {
    expect(normalizedSerialOf(null)).toBeNull();
  });
});
