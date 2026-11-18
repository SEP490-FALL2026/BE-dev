import {
  GrantRequestGateHook,
  type GrantRequestGate,
} from '../../src/modules/licensing/public/licensing.extension-points';

/**
 * The hook of the gate of requests as a test answers it: bound to `gate` from the start, and the gate the module of requests binds
 * when the application starts is left out (its `bind` does nothing). Provided in place of `GrantRequestGateHook`.
 */
export class StandInGrantRequestGateHook extends GrantRequestGateHook {
  constructor(gate: GrantRequestGate) {
    super();
    super.bind(gate);
  }

  override bind(): void {
    // The application's own gate is not asked while the test stands in for it.
  }
}

/** A gate that knows no request: no seat is granted and no outcome is reported to anybody. */
export const GATE_THAT_KNOWS_NO_REQUEST: GrantRequestGate = {
  check: () => Promise.resolve({ status: 'NOT_FOUND' }),
  claimForGrant: () => Promise.resolve({ status: 'NOT_FOUND' }),
  reportOutcome: () => Promise.resolve(),
  isWithdrawing: () => Promise.resolve(false),
  reportCancelled: () => Promise.resolve(false),
  reportExtended: () => Promise.resolve(),
  reportExtensionFailed: () => Promise.resolve(),
  reportRightReplaced: () => Promise.resolve(),
};
