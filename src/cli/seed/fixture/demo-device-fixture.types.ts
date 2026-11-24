/**
 * What the fixture says of the company machines (redesign wave 2, W2-25): the old machines entered through the initial record while the
 * installation phase is open, the new ones the system gives a code to, and who stands in for a department.
 */

/** A machine the company already had: entered through `POST /device-initial-records` before the seat baseline closes. */
export interface DemoDevice {
  /** The code the machine already carries (kept as it is: its origin is `LEGACY`). */
  assetCode: string;
  holder: string;
  /** The kind of machine (all the old ones are laptops). */
  deviceType: 'LAP' | 'PC' | 'OTH';
  /** How a rerun tells this machine from another besides its code. */
  serialNumber: string;
  /** The plan keys bundled with the machine (the operating system that came with it). */
  bundled: string[];
  /** The subscription whose key the machine already used when it was entered (an `INITIAL` activation): the plan is bought per machine. */
  initialKeyOf?: string;
  signature: boolean;
  acknowledge: boolean;
  changeTo?: string;
  retire?: boolean;
  tools?: ('CLAUDE_CODE' | 'CODEX')[];
  stop?: 'OPEN' | 'COMPLETED';
}

/** A machine bought after the baseline: the system gives it its code, so a rerun finds it by its serial number. */
export interface DemoNewDevice {
  /** The name the machine goes by on the network; the list of machines is searched with it, then the serial number tells it apart. */
  hostname: string;
  serialNumber: string;
  deviceType: 'LAP' | 'PC' | 'OTH';
  bundled: string[];
  /** Who it is handed to when it is entered; none: it waits in the stock. */
  holder?: string;
  /** The subscriptions of the plans bought per machine whose key the machine runs (an `OPERATION` activation). */
  keyOf?: string;
  condition?: 'BROKEN' | 'IN_REPAIR';
}

/** The IT Admin the Super Admin names to stand in for a department (QĐ-118). */
export interface DemoDepartmentSubstitute {
  department: string;
  substitute: string;
  reason: string;
}
