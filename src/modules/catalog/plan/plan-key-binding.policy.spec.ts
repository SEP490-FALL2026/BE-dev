import {
  PlanAdminConsoleNotApplicableError,
  PlanKeyBindingNotApplicableError,
  PlanReferencePriceNotApplicableError,
} from './plan.errors';
import { assertDeviceBundledShape, keyBindingOf } from './plan-key-binding.policy';

const price = { amountMinor: 1_000_000n, currency: 'VND' };

describe('keyBindingOf (declaring a plan)', () => {
  it('binds a K4 plan that says nothing to an account, as every K4 plan was before bindings', () => {
    expect(keyBindingOf('K4', undefined, null)).toBe('ACCOUNT');
  });

  it('takes the binding a K4 plan names', () => {
    expect(keyBindingOf('K4', 'DEVICE_KEY', null)).toBe('DEVICE_KEY');
    expect(keyBindingOf('K4', 'DEVICE_BUNDLED', null)).toBe('DEVICE_BUNDLED');
    expect(keyBindingOf('K4', 'ACCOUNT', null)).toBe('ACCOUNT');
  });

  it.each(['K1', 'K2', 'K5'] as const)('gives a %s plan no binding, and refuses one that names a binding', (kind) => {
    expect(keyBindingOf(kind, undefined, null)).toBeNull();
    expect(() => keyBindingOf(kind, 'ACCOUNT', null)).toThrow(PlanKeyBindingNotApplicableError);
    expect(() => keyBindingOf(kind, 'DEVICE_KEY', null)).toThrow(PlanKeyBindingNotApplicableError);
  });
});

describe('keyBindingOf (changing a plan)', () => {
  it('keeps the binding a K4 plan has when the change names none', () => {
    expect(keyBindingOf('K4', undefined, { provisioningType: 'K4', keyBinding: 'DEVICE_KEY' })).toBe('DEVICE_KEY');
  });

  it('changes it when the change names another', () => {
    expect(keyBindingOf('K4', 'ACCOUNT', { provisioningType: 'K4', keyBinding: 'DEVICE_KEY' })).toBe('ACCOUNT');
  });

  it('binds a plan that becomes K4 to an account, as hasAdminConsole follows the kind', () => {
    expect(keyBindingOf('K4', undefined, { provisioningType: 'K5', keyBinding: null })).toBe('ACCOUNT');
    expect(keyBindingOf('K4', undefined, { provisioningType: 'K2', keyBinding: null })).toBe('ACCOUNT');
  });

  it('takes the binding away from a plan that stops being K4', () => {
    expect(keyBindingOf('K2', undefined, { provisioningType: 'K4', keyBinding: 'DEVICE_KEY' })).toBeNull();
  });

  it('refuses a binding named for a plan that is not K4, even one that leaves K4 in the same change', () => {
    expect(() => keyBindingOf('K2', 'ACCOUNT', { provisioningType: 'K4', keyBinding: 'ACCOUNT' })).toThrow(
      PlanKeyBindingNotApplicableError,
    );
  });
});

describe('assertDeviceBundledShape', () => {
  it('lets a plan bundled with the machine have no price and no console', () => {
    expect(() => assertDeviceBundledShape('DEVICE_BUNDLED', null, false)).not.toThrow();
  });

  it('refuses a plan bundled with the machine that has a reference price', () => {
    expect(() => assertDeviceBundledShape('DEVICE_BUNDLED', price, false)).toThrow(
      PlanReferencePriceNotApplicableError,
    );
  });

  it('refuses a plan bundled with the machine that has an admin console', () => {
    expect(() => assertDeviceBundledShape('DEVICE_BUNDLED', null, true)).toThrow(PlanAdminConsoleNotApplicableError);
  });

  it.each(['ACCOUNT', 'DEVICE_KEY', null] as const)('judges nothing for a plan bound %s', (binding) => {
    expect(() => assertDeviceBundledShape(binding, price, true)).not.toThrow();
  });
});
