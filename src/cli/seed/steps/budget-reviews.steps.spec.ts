import { emptyIds, type DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 as fixture } from '../fixture/shared-demo-v4';
import { demoSteps } from '../seed-steps';
import { quartersToSign, explanationMove } from './demo.steps';
import { INVOICES, invoiceBody } from './demo-documents.steps';

describe('the finished months and quarterly explanations', () => {
  it('signs every older unsigned quarter while leaving the latest quarter open', () => {
    const periods = [
      { id: 'march', month: 3, kind: 'QUARTER', state: 'SIGNED' },
      { id: 'june', month: 6, kind: 'QUARTER', state: 'AWAITING_EXPLANATIONS' },
      { id: 'september', month: 9, kind: 'QUARTER', state: 'AWAITING_EXPLANATIONS' },
      { id: 'october', month: 10, kind: 'MONTH', state: 'CLOSED' },
    ];
    expect(quartersToSign(periods).map(({ id }) => id)).toEqual(['june']);
    expect(quartersToSign([])).toEqual([]);
    expect(quartersToSign([{ ...periods[0], state: 'AWAITING_EXPLANATIONS' }])).toEqual([]);
  });
  it('asks Finance then Design for two explanations and keeps another line pending', () => {
    const lines = ['CC-ENG', 'CC-DES', 'CC-FIN'].map((code) => ({
      costCenter: { id: code, code },
      explanationStatus: 'PENDING',
    }));
    const first = explanationMove(lines);
    expect(first.kind).toBe('explain');
    if (first.kind !== 'explain') throw new Error('Expected explanation');
    expect(first.line.costCenter?.code).toBe('CC-FIN');
    lines[2].explanationStatus = 'EXPLAINED';
    const second = explanationMove(lines);
    expect(second.kind).toBe('explain');
    if (second.kind !== 'explain') throw new Error('Expected explanation');
    expect(second.line.costCenter?.code).toBe('CC-DES');
    lines[1].explanationStatus = 'EXPLAINED';
    expect(explanationMove(lines).kind).toBe('present');
    expect(lines.filter(({ explanationStatus }) => explanationStatus === 'PENDING')).toHaveLength(1);
    expect(explanationMove(lines.slice(0, 1)).kind).toBe('limited');
  });
  it('confirms two request invoices in the previous completed months without touching shared-pool links', () => {
    const ids = emptyIds();
    ids.requests.set('R18', 'request-18');
    ids.requests.set('R56', 'request-56');
    const ctx = { fixture, ids, today: '2026-11-18' } as unknown as DemoRunContext;
    for (const [number, requestId, month] of [
      ['SV-INV-011', 'request-18', '2026-09'],
      ['SV-INV-012', 'request-56', '2026-10'],
    ]) {
      const spec = INVOICES.find((row) => row.number === number)!;
      expect(spec).toMatchObject({ quantity: 1, target: 'CONFIRMED' });
      const body = invoiceBody(ctx, spec, `document-${number}`);
      expect(body.link).toEqual({ requestId });
      expect(body.servicePeriodMonth).toBe(month);
    }
    expect(INVOICES).toHaveLength(12);
  });
  it('closes reviews after all invoice and expense steps', () => {
    const keys = demoSteps(fixture).map(({ key }) => key);
    expect(keys.at(-1)).toBe('demo.budget-reviews');
    expect(keys.indexOf('demo.budget-reviews')).toBeGreaterThan(keys.indexOf('demo.out-of-process'));
    expect(keys.indexOf('demo.budget-reviews')).toBeGreaterThan(keys.indexOf('demo.purchase-invoices'));
  });
});
