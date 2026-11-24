import { Client } from 'pg';
import { DevicesHarness, type DeviceWire } from '../../support/devices-harness';
import { createDepartment, enterEmployee } from '../../support/builders/organization.builder';

const h = new DevicesHarness();

describe('device lifecycle: handover, holder change, and return to stock (integration, real PostgreSQL)', () => {
  let dept2Id: string;
  let dept2Code: string;
  let seq = 0;
  const sql = (): Client => h.ctx.sql;

  const placedInSeed = async (tag: string): Promise<string> => h.person(`E-LC${(seq += 1)}${tag}`);

  const createItInDept = async (departmentCode: string, tag: string) => {
    seq += 1;
    const code = `E-ITLC${seq}${tag}`;
    const { id: employeeId } = await enterEmployee(h.ctx, h.admin, {
      employeeCode: code,
      fullName: `IT ${code}`,
      workEmail: `${code.toLowerCase()}@acme.vn`,
      employmentType: 'STAFF',
      hireDate: '2025-01-01',
      departmentCode,
      jobTitle: 'IT Admin',
    });
    const account = await h.account(code, employeeId, 'IT_ADMIN');
    return { employeeId, account };
  };

  beforeAll(async () => {
    await h.start();
    const d2 = await createDepartment(h.ctx, h.admin, { code: 'LC-D2', name: 'Lifecycle Dept 2' });
    dept2Id = d2.id;
    dept2Code = d2.code;
  }, 300_000);

  afterAll(async () => {
    await h.stop();
  });

  it('W2-06 (a)-(e): assigns from stock without tick, requires softwareRemoval on transfer, blocks NOT_USABLE & AWAITING_RETURN', async () => {
    const [an, binh, chi] = [await placedInSeed('AN'), await placedInSeed('BI'), await placedInSeed('CH')];

    // (e) In-stock device handed over to Chi without softwareRemoval -> 201.
    const inStock = h.dataOf<DeviceWire>(
      await h.createDevice({ deviceType: 'LAP', hostname: 'LC-STOCK', os: 'Windows 11' }).expect(201),
    );
    const assignedChi = h.dataOf<DeviceWire>(
      await h.changeHolderRaw(inStock.id, { holderEmployeeId: chi, collectorInstalled: false }).expect(201),
    );
    expect(assignedChi).toMatchObject({ custody: 'ASSIGNED', state: 'NO_COLLECTOR', holder: { id: chi } });

    // (b) Reassigning ASSIGNED device without softwareRemoval -> 422 DEVICE.SOFTWARE_REMOVAL_REQUIRED; history unchanged.
    const missingRemoval = await h
      .changeHolderRaw(inStock.id, { holderEmployeeId: an, collectorInstalled: true })
      .expect(422);
    expect(h.codeOf(missingRemoval)).toBe('DEVICE.SOFTWARE_REMOVAL_REQUIRED');
    const missingNote = await h
      .changeHolderRaw(inStock.id, {
        holderEmployeeId: an,
        collectorInstalled: true,
        softwareRemoval: { outcome: 'NOT_REMOVABLE', note: '   ' },
      })
      .expect(422);
    expect(h.codeOf(missingNote)).toBe('DEVICE.SOFTWARE_REMOVAL_NOTE_REQUIRED');

    // (a) Handover An -> Binh with REMOVED -> old reg ended HOLDER_CHANGED + REMOVED, new reg collectorInstalled.
    const first = await h.registered(an);
    const transferred = h.dataOf<DeviceWire>(
      await h
        .changeHolder(first.id, binh, {
          collectorInstalled: true,
          softwareRemoval: { outcome: 'REMOVED' },
        })
        .expect(201),
    );
    expect(transferred.holder?.id).toBe(binh);
    const oldReg = (
      await sql().query<{ end_cause: string; software_removal: string }>(
        `SELECT end_cause, software_removal FROM device_registrations WHERE device_id = $1 AND ended_at IS NOT NULL`,
        [first.id],
      )
    ).rows[0];
    expect(oldReg).toEqual({ end_cause: 'HOLDER_CHANGED', software_removal: 'REMOVED' });

    // (c) Broken device cannot be assigned -> 409 DEVICE.NOT_USABLE.
    const broken = h.dataOf<DeviceWire>(
      await h.createDevice({ deviceType: 'PC', hostname: 'LC-BRK', os: 'Linux' }).expect(201),
    );
    await sql().query(`UPDATE managed_devices SET condition = 'BROKEN' WHERE id = $1`, [broken.id]);
    const brokenRes = await h
      .changeHolderRaw(broken.id, { holderEmployeeId: an, collectorInstalled: false })
      .expect(409);
    expect(h.codeOf(brokenRes)).toBe('DEVICE.NOT_USABLE');

    // (d) Device with OPEN return task -> 409 DEVICE.AWAITING_RETURN.
    const awaiting = await h.registered(an);
    await sql().query(
      `INSERT INTO device_return_tasks (id, organization_id, device_id, registration_id, employee_id, offboarding_case_id, department_id, due_on)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, gen_random_uuid(), $5, $6)`,
      [h.seed.organizationId, awaiting.id, awaiting.registrationId, an, h.seed.departmentId, h.today()],
    );
    const awaitingRes = await h
      .changeHolderRaw(awaiting.id, {
        holderEmployeeId: binh,
        collectorInstalled: true,
        softwareRemoval: { outcome: 'REMOVED' },
      })
      .expect(409);
    expect(h.codeOf(awaitingRes)).toBe('DEVICE.AWAITING_RETURN');
  });

  it('W2-08 (a)-(c): returns assigned device to stock, rejects missing note and IN_STOCK machine', async () => {
    const an = await placedInSeed('RET-AN');
    const machine = await h.registered(an);

    // (b) NOT_REMOVABLE without note -> 422 DEVICE.SOFTWARE_REMOVAL_NOTE_REQUIRED.
    const noNote = await h
      .returnDevice(machine.id, {
        condition: 'USABLE',
        softwareRemoval: { outcome: 'NOT_REMOVABLE' },
      })
      .expect(422);
    expect(h.codeOf(noNote)).toBe('DEVICE.SOFTWARE_REMOVAL_NOTE_REQUIRED');

    // (a) Return to stock -> registration RETURNED + REMOVED, custody = IN_STOCK, condition updated.
    const returned = h.dataOf<DeviceWire>(
      await h
        .returnDevice(machine.id, {
          condition: 'IN_REPAIR',
          conditionNote: 'Keyboard check',
          softwareRemoval: { outcome: 'REMOVED' },
        })
        .expect(201),
    );
    expect(returned).toMatchObject({
      custody: 'IN_STOCK',
      condition: 'IN_REPAIR',
      conditionNote: 'Keyboard check',
      holder: null,
      registrationId: null,
    });

    // (c) Returning an IN_STOCK machine -> 409 DEVICE.NOT_HELD.
    const notHeld = await h
      .returnDevice(machine.id, {
        condition: 'USABLE',
        softwareRemoval: { outcome: 'REMOVED' },
      })
      .expect(409);
    expect(h.codeOf(notHeld)).toBe('DEVICE.NOT_HELD');
  });

  it('H17: enforces acting IT Admin for cross-department transfer and return-to-stock, auditing bySubstitute', async () => {
    const itDept2 = await createItInDept(dept2Code, 'D2');
    await sql().query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [dept2Id, itDept2.employeeId]);

    const anSeed = await placedInSeed('H17A');
    const { id: targetDept2 } = await enterEmployee(h.ctx, h.admin, {
      employeeCode: 'E-H17D2',
      fullName: 'Dept2 Holder',
      workEmail: 'h17d2@acme.vn',
      employmentType: 'STAFF',
      hireDate: '2025-01-01',
      departmentCode: dept2Code,
      jobTitle: 'Developer',
    });

    const machine = await h.registered(anSeed);

    // h.it1 covers only seed dept, itDept2 covers only dept2 -> both blocked on cross-dept transfer.
    expect(h.codeOf(await h.changeHolder(machine.id, targetDept2, {}, h.it1).expect(403))).toBe('DEVICE.NOT_IN_CHARGE');
    expect(h.codeOf(await h.changeHolder(machine.id, targetDept2, {}, itDept2.account).expect(403))).toBe(
      'DEVICE.NOT_IN_CHARGE',
    );

    // Return-to-stock by non-acting IT -> 403 DEVICE.NOT_IN_CHARGE.
    expect(
      h.codeOf(
        await h
          .returnDevice(machine.id, { condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' } }, itDept2.account)
          .expect(403),
      ),
    ).toBe('DEVICE.NOT_IN_CHARGE');

    // Appoint h.it1 temporarily on dept2 -> cross-dept transfer succeeds and audits bySubstitute: true.
    await sql().query(
      `INSERT INTO department_it_substitutes (id, organization_id, department_id, substitute_employee_id, replaced_employee_id, reason, appointed_by_app_user_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'Cross-dept cover', $5)`,
      [h.seed.organizationId, dept2Id, h.it1.employeeId, itDept2.employeeId, h.it1.appUserId],
    );
    const moved = h.dataOf<DeviceWire>(await h.changeHolder(machine.id, targetDept2, {}, h.it1).expect(201));
    expect(moved.holder?.id).toBe(targetDept2);

    const audits = (
      await sql().query<{ after: { bySubstitute?: boolean } }>(
        `SELECT after FROM audit_events WHERE target_id = $1 AND action = 'DEVICE.HOLDER_CHANGED' ORDER BY occurred_at DESC LIMIT 1`,
        [machine.id],
      )
    ).rows;
    expect(audits[0]?.after?.bySubstitute).toBe(true);
  });

  it('W2-09 (a)-(b) & H17: updates condition preserving holder, enforces condition unchanged, and guards retirement', async () => {
    const itDept2 = await createItInDept(dept2Code, 'COND2');
    await sql().query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [dept2Id, itDept2.employeeId]);
    const binh = await placedInSeed('BINH-COND');
    const machine = await h.registered(binh);

    // W2-09 (a): IN_REPAIR preserves holder & unchanged condition is 409 DEVICE.CONDITION_UNCHANGED.
    const inRepair = h.dataOf<DeviceWire>(
      await h.changeCondition(machine.id, { condition: 'IN_REPAIR', note: 'Cooling fan' }, h.it1).expect(201),
    );
    expect(inRepair).toMatchObject({
      condition: 'IN_REPAIR',
      conditionNote: 'Cooling fan',
      custody: 'ASSIGNED',
      holder: { id: binh },
    });
    expect(h.codeOf(await h.changeCondition(machine.id, { condition: 'IN_REPAIR' }, h.it1).expect(409))).toBe(
      'DEVICE.CONDITION_UNCHANGED',
    );

    // H17: another IT Admin cannot change condition or retire an ASSIGNED device.
    expect(h.codeOf(await h.changeCondition(machine.id, { condition: 'USABLE' }, itDept2.account).expect(403))).toBe(
      'DEVICE.NOT_IN_CHARGE',
    );
    expect(h.codeOf(await h.retire(machine.id, 'Not my dept', itDept2.account).expect(403))).toBe(
      'DEVICE.NOT_IN_CHARGE',
    );

    // W2-09 (b): back to USABLE succeeds for acting IT Admin, and retiring succeeds for acting IT Admin.
    const usable = h.dataOf<DeviceWire>(
      await h.changeCondition(machine.id, { condition: 'USABLE' }, h.it1).expect(201),
    );
    expect(usable).toMatchObject({ condition: 'USABLE', conditionNote: null, holder: { id: binh } });

    const retired = h.dataOf<DeviceWire>(await h.retire(machine.id, 'End of service', h.it1).expect(201));
    expect(retired).toMatchObject({ custody: 'RETIRED', holder: null });
  });
});
