import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { SeatMonthService } from '../../../src/modules/budgets/seat-month/seat-month.service';
import { SharedPoolLineFactsService } from '../../../src/modules/budgets/shared-pool-line/shared-pool-line-facts.service';
import { OrganizationApi } from '../../../src/modules/organization/public/organization.api';
import { insertEmployeeWithoutPlacement } from '../../support/builders/account.builder';
import { InvoiceHarness } from '../../support/invoice-harness';
import { pretendBusinessToday } from '../../support/pretend-today';

const h = new InvoiceHarness();
const M = 1_000_000;

/**
 * Warehouse identity for W3-04 on the 11/2026 scenario:
 * sum(dept seat-months) + sum(unplaced held seat-month cost) + idleCost == roundHalfAway(paidSeatDays * monthly / D)
 * within per-segment rounding error.
 */
describe('shared-pool-line warehouse identity (integration; W3-04)', () => {
  const seatMonthService = () => h.ctx.app.get(SeatMonthService, { strict: false });
  const poolFacts = () => h.ctx.app.get(SharedPoolLineFactsService, { strict: false });
  const runner = () => h.ctx.app.get(TransactionRunner, { strict: false });
  const organization = () => h.ctx.app.get(OrganizationApi, { strict: false });

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const placeEmployee = async (code: string, departmentId: string, validFrom: string): Promise<string> => {
    const created = await runner().run((tx) =>
      organization().createEmployeeWithPlacement(tx, {
        organizationId: h.seed.organizationId,
        employeeCode: code,
        fullName: `Person ${code}`,
        employmentType: 'STAFF',
        hireDate: validFrom,
        memberSince: validFrom,
        departmentId,
        jobTitle: null,
      }),
    );

    return created.id;
  };

  const insertSeat = async (
    subscriptionId: string,
    planId: string,
    employeeId: string,
    validFrom: string,
  ): Promise<void> => {
    const id = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, valid_from, valid_until, valid_from_basis, created_by_app_user_id,
         granted_on)
       VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, $4, $5, $6, $6, $7::date, NULL, 'ACTUAL', $8, $7::date)`,
      [
        id,
        h.seed.organizationId,
        planId,
        subscriptionId,
        employeeId,
        `${id.slice(0, 8)}@acme.vn`,
        validFrom,
        h.it1.appUserId,
      ],
    );
  };

  it('balances department charges + unplaced held cost + idleCost against paidSeatDays * monthly / D on 11/2026', async () => {
    const month = '2026-11-01';
    const monthly = 500_000n;
    const deptA = await h.departmentWithHead('P-WH-A');
    const deptB = await h.departmentWithHead('P-WH-B');
    await h.setItAdminInCharge(deptA.department, { employeeId: h.it1.employeeId, account: h.it1 });
    await h.setItAdminInCharge(deptB.department, { employeeId: h.it1.employeeId, account: h.it1 });
    await h.budgetFor(deptA, { total: 50 * M });
    await h.budgetFor(deptB, { total: 50 * M });

    const poolSub = await h.subscription(10, 'K2');
    const planId = await h.planOf(poolSub);
    await h.ctx.sql.query(
      `UPDATE subscriptions
          SET monthly_unit_price_minor = $2,
              unit_price_minor = $2,
              price_reporting_minor = $2,
              start_date = '2026-07-01'::date,
              end_date = '2027-06-30'::date,
              renewal_date = '2027-07-01'::date
        WHERE id = $1::uuid`,
      [poolSub, Number(monthly)],
    );
    await h.ctx.sql.query(
      `UPDATE subscription_lines
          SET monthly_unit_price_minor = $2,
              start_date = '2026-07-01'::date,
              end_date = '2027-06-30'::date,
              renewal_date = '2027-07-01'::date
        WHERE subscription_id = $1::uuid`,
      [poolSub, Number(monthly)],
    );

    for (let i = 0; i < 4; i += 1) {
      await insertSeat(
        poolSub,
        planId,
        await placeEmployee(`WH-A${i}`, deptA.department.id, '2026-07-01'),
        '2026-11-01',
      );
    }
    for (let i = 0; i < 3; i += 1) {
      await insertSeat(
        poolSub,
        planId,
        await placeEmployee(`WH-B${i}`, deptB.department.id, '2026-07-01'),
        '2026-11-01',
      );
    }
    const unplacedId = await insertEmployeeWithoutPlacement(h.ctx, h.seed, {
      code: 'WH-UNPLACED',
      hireDate: '2026-11-01',
    });
    await insertSeat(poolSub, planId, unplacedId, '2026-11-16');

    pretendBusinessToday(h.ctx.app, '2026-12-05');
    await seatMonthService().chargeMonth(month);

    const [line] = await poolFacts().linesOfMonth(month, poolSub, 10);
    jest.restoreAllMocks();

    // 4 * 500k + 3 * 500k = 3.500.000 in departments; 15/30 * 500k = 250.000 held without placement; idle = 1.250.000; paid = 5.000.000.
    const unplacedHeldMinor = (15n * monthly) / 30n;
    const identitySum = line.allocatedMinor + unplacedHeldMinor + (line.idleCostMinor ?? 0n);

    expect(line.allocatedMinor).toBe(3_500_000n);
    expect(line.idleCostMinor).toBe(1_250_000n);
    expect(line.paidMinor).toBe(5_000_000n);
    expect(identitySum).toBe(line.paidMinor);
  });
});
