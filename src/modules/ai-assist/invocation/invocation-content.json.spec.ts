import { Prisma } from '../../../generated/prisma/client';
import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { aiInvocationContextJson, aiInvocationParsedJson, aiInvocationResultJson } from './invocation-content.json';

const CONTEXT = {
  generatedAt: '2026-11-04T09:00:00.000Z',
  requests: [
    {
      sourceRef: 'R001',
      stepKind: 'SPEND_APPROVAL',
      softwareName: 'Notion',
      beneficiaryDisplayName: 'Nhóm 5 người',
      reason: 'Họp nhóm',
      requestedDurationLabel: '6 tháng',
      estimatedCostRef: 'C001',
    },
  ],
};

const PARSED = {
  items: [{ sourceRef: 'R001', stepKind: 'SPEND_APPROVAL', summary: 'Nhóm cần Notion, {{cost:C001}}.' }],
};

const RESULT = {
  total: 3,
  steps: [
    {
      sourceRef: 'R001',
      stepId: '00000000-0000-4000-8000-000000000001',
      requestId: '10000000-0000-4000-8000-000000000001',
      stepKind: 'SPEND_APPROVAL',
    },
  ],
  accepted: [{ sourceRef: 'R001', summary: 'Nhóm cần Notion, 1200000 VND.' }],
  rejections: [{ sourceRef: 'R002', code: 'INVENTED_NUMBER' }],
};

describe('the codecs of ai_invocation_contents (context, parsed, result)', () => {
  it('reads and writes each column in the shape it has always been written in', () => {
    expect(aiInvocationContextJson.decode(CONTEXT)).toEqual(CONTEXT);
    expect(aiInvocationContextJson.encode(aiInvocationContextJson.decode(CONTEXT))).toEqual(CONTEXT);
    expect(aiInvocationParsedJson.decode(PARSED)).toEqual(PARSED);
    expect(aiInvocationParsedJson.encode(aiInvocationParsedJson.decode(PARSED))).toEqual(PARSED);
    expect(aiInvocationResultJson.decode(RESULT)).toEqual(RESULT);
    expect(aiInvocationResultJson.encode(aiInvocationResultJson.decode(RESULT))).toEqual(RESULT);
  });

  it('reads an empty parsed output or result as null and writes null as the database NULL; the context is never null', () => {
    expect(aiInvocationParsedJson.decode(null)).toBeNull();
    expect(aiInvocationResultJson.decode(null)).toBeNull();
    expect(aiInvocationParsedJson.encode(null)).toBe(Prisma.DbNull);
    expect(() => aiInvocationContextJson.decode(null)).toThrow(JsonColumnShapeError);
  });

  it.each([
    ['a field the contract does not have', { ...CONTEXT, extra: 1 }],
    ['a real id in place of a reference', { ...CONTEXT, requests: [{ ...CONTEXT.requests[0], sourceRef: 'step-1' }] }],
    ['more than 20 requests', { ...CONTEXT, requests: Array.from({ length: 21 }, () => CONTEXT.requests[0]) }],
    ['a list', [1, 2]],
  ])('refuses a context with %s, naming the table and the column and never the value', (_label, value) => {
    expect(() => aiInvocationContextJson.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => aiInvocationContextJson.decode(value)).toThrow('ai_invocation_contents.context');
    expect(() => aiInvocationContextJson.decode(value)).not.toThrow(/Notion|Họp nhóm/);
  });

  it('refuses parsed output and a result of another shape', () => {
    expect(() => aiInvocationParsedJson.decode({ items: [{ sourceRef: 'R001' }] })).toThrow(
      'ai_invocation_contents.parsed',
    );
    expect(() => aiInvocationResultJson.decode({ ...RESULT, total: -1 })).toThrow('ai_invocation_contents.result');
    expect(() =>
      aiInvocationResultJson.decode({ ...RESULT, rejections: [{ sourceRef: 'R002', code: 'made up' }] }),
    ).toThrow('ai_invocation_contents.result');
  });
});
