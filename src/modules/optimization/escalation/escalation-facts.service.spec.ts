import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { LicensingGhostSeatApi } from '../../licensing/public/licensing-ghost-seat.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { PersonnelApi } from '../../personnel/public/personnel.api';
import type { LeaveInterval } from '../../personnel/public/personnel.types';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import { EscalationFactsService } from './escalation-facts.service';

const TODAY = '2026-11-16';
const TOMORROW = '2026-11-17';
const YESTERDAY = '2026-11-15';

/**
 * The holder of a recommendation is away today when the leave began and has not ended before tomorrow: the interval reads "up to, and not
 * including, `endedOn`" (the day they came back), as the weekly pass reads it. The module of the personnel already leaves out the leaves that
 * ended today, so a spec over the database cannot tell `endedOn > today` from `endedOn >= today`; this one hands the rule the interval itself.
 */
describe('EscalationFactsService.ofBatch — the long leave of a holder (FR-4.9 gate 3, B3A-02)', () => {
  const awayAmong = async (intervals: LeaveInterval[]): Promise<boolean> => {
    const licensing = { listSeatsForRules: jest.fn().mockResolvedValue([]) } as unknown as LicensingGhostSeatApi;
    const personnel = {
      getTransfersInOverlap: jest.fn().mockResolvedValue([]),
      getLeaveIntervals: jest.fn().mockResolvedValue(intervals),
      getHandingOverCases: jest.fn().mockResolvedValue([]),
    } as unknown as PersonnelApi;
    const organization = { getEmployeePlacement: jest.fn().mockResolvedValue(null) } as unknown as OrganizationReadApi;
    const identity = { findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set()) };
    const facts = new EscalationFactsService(licensing, personnel, organization, identity as never);

    const batch = await facts.ofBatch({} as DbTx, TODAY, [{ employeeId: 'E1' } as GhostSeatRecord]);

    return batch.leaveOrHandover.has('E1');
  };
  const leave = (startedOn: string, endedOn: string | null): LeaveInterval => ({
    employeeId: 'E1',
    startedOn,
    endedOn,
  });

  it('is away on a leave that runs (no end)', async () => {
    expect(await awayAmong([leave(YESTERDAY, null)])).toBe(true);
  });

  it('is away on a leave that ends tomorrow, and on the day it began', async () => {
    expect(await awayAmong([leave(YESTERDAY, TOMORROW)])).toBe(true);
    expect(await awayAmong([leave(TODAY, TOMORROW)])).toBe(true);
  });

  it('is not away on a leave that ended today: the holder came back today', async () => {
    expect(await awayAmong([leave('2026-11-01', TODAY)])).toBe(false);
  });

  it('is not away on a leave that began tomorrow, nor on one that ended yesterday', async () => {
    expect(await awayAmong([leave(TOMORROW, null)])).toBe(false);
    expect(await awayAmong([leave('2026-11-01', YESTERDAY)])).toBe(false);
  });

  describe('departmentAccessOf', () => {
    const setupAccess = (responsible: string | null, usable: readonly string[]) => {
      const licensing = { listSeatsForRules: jest.fn() } as unknown as LicensingGhostSeatApi;
      const personnel = {
        getTransfersInOverlap: jest.fn(),
        getLeaveIntervals: jest.fn(),
        getHandingOverCases: jest.fn(),
      } as unknown as PersonnelApi;
      const organization = {
        getItAdminInChargeOfDepartment: jest.fn().mockResolvedValue(responsible),
      } as unknown as OrganizationReadApi;
      const identity = {
        findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(usable)),
      };
      const facts = new EscalationFactsService(licensing, personnel, organization, identity as never);
      return { facts, tx: {} as DbTx };
    };

    it('allows any IT Admin when the department has no IT Admin in charge', async () => {
      const { facts, tx } = setupAccess(null, []);
      await expect(facts.departmentAccessOf(tx, 'dep-1', 'it-other')).resolves.toEqual({
        allowed: true,
        byInCharge: false,
      });
    });

    it('allows the IT Admin in charge with byInCharge=true', async () => {
      const { facts, tx } = setupAccess('it-1', ['it-1']);
      await expect(facts.departmentAccessOf(tx, 'dep-1', 'it-1')).resolves.toEqual({
        allowed: true,
        byInCharge: true,
      });
    });

    it('refuses another IT Admin when the one in charge is usable, and allows when unusable', async () => {
      const active = setupAccess('it-1', ['it-1']);
      await expect(active.facts.departmentAccessOf(active.tx, 'dep-1', 'it-other')).resolves.toEqual({
        allowed: false,
        byInCharge: false,
      });

      const locked = setupAccess('it-1', []);
      await expect(locked.facts.departmentAccessOf(locked.tx, 'dep-1', 'it-other')).resolves.toEqual({
        allowed: true,
        byInCharge: false,
      });
    });
  });
});
