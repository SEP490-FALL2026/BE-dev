import { Prisma } from '../../../../generated/prisma/client';
import { JsonColumnShapeError } from '../../../../infrastructure/database/json-column.errors';
import { k1ChecklistJson } from './provisioning-k1-checklist.json';
import type { StoredK1Checklist } from './provisioning-k1-checklist.policy';

const STORED = {
  variant: 'STILL_EMPLOYED',
  items: [
    { code: 'RENEWAL_DISABLED', order: 1, doneAt: '2026-11-13T08:00:00.000Z' },
    { code: 'EVIDENCE_RECORDED', order: 2, doneAt: '2026-11-13T08:01:00.000Z' },
  ],
} as const;

describe('k1ChecklistJson (provisioning_tasks.k1_checklist)', () => {
  it('reads the checklist a completed K1 revocation keeps, and NULL as none (a task that is not K1, or was completed before the checklist)', () => {
    expect(k1ChecklistJson.decode(STORED)).toEqual(STORED);
    expect(k1ChecklistJson.decode(null)).toBeNull();
  });

  it('reads and writes the checklist a K1 grant keeps (K1-GR): the variant GRANT and its two steps', () => {
    const grant: StoredK1Checklist = {
      variant: 'GRANT',
      items: [
        { code: 'COMPANY_EMAIL_REGISTERED', order: 1, doneAt: '2026-11-15T08:00:00.000Z' },
        { code: 'NO_PERSONAL_DEVICE_MFA', order: 2, doneAt: '2026-11-15T08:01:00.000Z' },
      ],
    };

    expect(k1ChecklistJson.decode(grant)).toEqual(grant);
    expect(k1ChecklistJson.encode(grant)).toEqual(grant);
  });

  it.each([
    ['a variant that does not exist', { ...STORED, variant: 'ON_LEAVE' }],
    [
      'a step that does not exist',
      { ...STORED, items: [{ code: 'COFFEE', order: 1, doneAt: '2026-11-13T08:00:00.000Z' }] },
    ],
    ['a step with no instant', { ...STORED, items: [{ code: 'RENEWAL_DISABLED', order: 1 }] }],
    [
      'a step with an instant that is text',
      { ...STORED, items: [{ code: 'RENEWAL_DISABLED', order: 1, doneAt: 'yesterday' }] },
    ],
    ['an empty list', { ...STORED, items: [] }],
    ['a key nobody writes', { ...STORED, evidence: 'ticket IT-9' }],
    ['a list', [STORED]],
    ['a bare string', 'RENEWAL_DISABLED'],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => k1ChecklistJson.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => k1ChecklistJson.decode(value)).toThrow('provisioning_tasks.k1_checklist');
    expect(() => k1ChecklistJson.decode(value)).not.toThrow(/ticket IT-9|COFFEE|yesterday/);
  });

  it('writes the checklist as it has always been written: the variant and the steps with their order and instant; none is the database NULL', () => {
    const written = k1ChecklistJson.encode({
      variant: 'DEPARTURE',
      items: [{ code: 'MAILBOX_LOCKED', order: 6, doneAt: '2026-11-13T09:00:00.000Z' }],
    });

    expect(written).toEqual({
      variant: 'DEPARTURE',
      items: [{ code: 'MAILBOX_LOCKED', order: 6, doneAt: '2026-11-13T09:00:00.000Z' }],
    });
    expect(k1ChecklistJson.encode(null)).toBe(Prisma.DbNull);
  });
});
