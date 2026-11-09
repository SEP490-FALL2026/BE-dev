import { PersonnelApi } from '../../../src/modules/personnel/public/personnel.api';
import { GhostSeatWorld } from '../../support/ghost-seat-world';

const w = new GhostSeatWorld();

describe('PersonnelApi: the transfers in overlap (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await w.startWorld();
  }, 240000);

  afterAll(async () => {
    await w.stop();
  });

  it('QĐ-90c, DA6-15: only a transfer that has taken effect and is not closed is in overlap; a waiting one, a closed one and a cancelled one are not; getTransfersByIds tells the rest', async () => {
    const from = await w.headedDepartment('P-OV-FROM');
    const to = await w.headedDepartment('P-OV-TO');
    const person = async (code: string) => w.personIn(code, from.departmentId);
    const [pending, effective, closed, cancelled] = [
      await person('E-OV-1'),
      await person('E-OV-2'),
      await person('E-OV-3'),
      await person('E-OV-4'),
    ];
    await w.transferOf(pending, from.departmentId, to.departmentId, '2030-01-01', 'PENDING');
    const effectiveId = await w.transferOf(effective, from.departmentId, to.departmentId, '2026-10-12');
    const closedId = await w.transferOf(closed, from.departmentId, to.departmentId, '2026-10-12');
    await w.closeTransfer(closedId);
    const cancelledId = await w.transferOf(cancelled, from.departmentId, to.departmentId, '2026-10-12', 'CANCELLED');
    const api = w.ctx.app.get(PersonnelApi);

    const overlap = await api.getTransfersInOverlap([pending, effective, closed, cancelled], '2026-11-09');

    expect(overlap).toEqual([
      expect.objectContaining({
        employeeId: effective,
        transferId: effectiveId,
        fromDepartmentId: from.departmentId,
        toDepartmentId: to.departmentId,
        effectiveOn: '2026-10-12',
        status: 'EFFECTIVE',
      }),
    ]);
    const byId = await api.getTransfersByIds([closedId, cancelledId, effectiveId]);
    expect(Object.fromEntries(byId.map((t) => [t.transferId, [t.status, t.closedAt !== null]]))).toEqual({
      [closedId]: ['EFFECTIVE', true],
      [cancelledId]: ['CANCELLED', false],
      [effectiveId]: ['EFFECTIVE', false],
    });
    expect(await api.getTransfersInOverlap([], '2026-11-09')).toEqual([]);
  });
});
