import { validateQueueSummary } from '../queue-summary/queue-summary-output.policy';
import {
  SIMULATED_IDENTITY,
  SIMULATED_PROMPT_TEXT,
  simulatedQueueAnswer,
  simulatedSummaryOf,
} from './ai-service-simulated.policy';
import {
  QUEUE_MAX_REQUESTS,
  QUEUE_TEXT_LIMITS,
  type QueueContext,
  type QueueRequestItem,
  queueSummaryServiceResponseSchema,
} from './ai-service.types';

const codePoints = (text: string) => [...text].length;

const item = (overrides: Partial<QueueRequestItem> = {}): QueueRequestItem => ({
  sourceRef: 'R001',
  stepKind: 'NEED_APPROVAL',
  softwareName: 'Figma Professional',
  beneficiaryDisplayName: 'Nguyễn Văn A',
  reason: 'Thiết kế giao diện dự án X quý 4',
  requestedDurationLabel: '6 tháng',
  estimatedCostRef: null,
  ...overrides,
});

const contextOf = (...requests: QueueRequestItem[]): QueueContext => ({
  generatedAt: '2026-11-20T03:15:00.000Z',
  requests: requests.map((request, index) => ({ ...request, sourceRef: `R${String(index + 1).padStart(3, '0')}` })),
});

/** The checks of the backend on the simulated lines of `context`: what a line of the model goes through. */
const checked = (context: QueueContext) =>
  validateQueueSummary(context, {
    items: context.requests.map((request) => ({
      sourceRef: request.sourceRef,
      stepKind: request.stepKind,
      summary: simulatedSummaryOf(request),
    })),
  });

/** `start` filled with words up to exactly `size` code points. */
function fill(start: string, size: number): string {
  const letters = [...start];
  while (letters.length < size) letters.push(letters.length % 7 === 0 ? ' ' : 'ơ');

  return letters.slice(0, size).join('');
}

/** A name of exactly `size` code points, an astral character included so code units and code points differ. */
const nameOf = (stem: string, size: number) => fill(`${stem} 😀`, size);

/** A reason of exactly 1000 code points: words with numbers between them, no advice. */
function longReason(): string {
  const words: string[] = [];
  for (let index = 0; codePoints(words.join(' ')) < QUEUE_TEXT_LIMITS.reason; index += 1) {
    words.push(index % 3 === 0 ? `${2026 + index}` : index % 3 === 1 ? 'thiết kế' : 'giao diện');
  }
  const letters = [...words.join(' ')].slice(0, QUEUE_TEXT_LIMITS.reason);
  if (letters[letters.length - 1] === ' ') letters[letters.length - 1] = 'x';

  return letters.join('');
}

describe('the simulated summary lines (simulated source of answers, checked like a model)', () => {
  it('writes the line of a need step from the template, with its duration when it has one', () => {
    expect(simulatedSummaryOf(item())).toBe(
      'Nguyễn Văn A đề nghị dùng Figma Professional, thời hạn 6 tháng. Lý do: Thiết kế giao diện dự án X quý 4',
    );
    expect(simulatedSummaryOf(item({ requestedDurationLabel: null }))).toBe(
      'Nguyễn Văn A đề nghị dùng Figma Professional. Lý do: Thiết kế giao diện dự án X quý 4',
    );
  });

  it('writes the line of a spend step with the placeholder of its cost, never an amount', () => {
    const spend = item({
      stepKind: 'SPEND_APPROVAL',
      softwareName: 'Jira Software',
      beneficiaryDisplayName: 'Trần Thị B',
      reason: 'Quản lý sprint cho nhóm 5 người',
      requestedDurationLabel: '12 tháng',
      estimatedCostRef: 'C001',
    });

    expect(simulatedSummaryOf(spend)).toBe(
      'Bước duyệt chi Jira Software cho Trần Thị B, chi phí ước tính {{cost:C001}}, thời hạn 12 tháng. Lý do: Quản lý sprint cho nhóm 5 người',
    );
    expect(simulatedSummaryOf({ ...spend, estimatedCostRef: null, requestedDurationLabel: null })).toBe(
      'Bước duyệt chi Jira Software cho Trần Thị B. Lý do: Quản lý sprint cho nhóm 5 người',
    );
  });

  it('drops the reason part when the reason has no word', () => {
    expect(simulatedSummaryOf(item({ reason: '' }))).toBe(
      'Nguyễn Văn A đề nghị dùng Figma Professional, thời hạn 6 tháng',
    );
    expect(simulatedSummaryOf(item({ reason: ' \n\t ' }))).toBe(
      'Nguyễn Văn A đề nghị dùng Figma Professional, thời hạn 6 tháng',
    );
  });

  it('passes every check of the backend for numbers in the reason, a cost, a 1000-character reason and 120-character names', () => {
    const context = contextOf(
      item({ reason: 'Dự án 2026 cần 5 tài khoản cho 3 nhóm, ngân sách 12.000.000 VND, 30% thời gian' }),
      item({ stepKind: 'SPEND_APPROVAL', estimatedCostRef: 'C001', reason: 'Gia hạn 12 tháng cho 8 người' }),
      item({ reason: longReason() }),
      item({
        stepKind: 'SPEND_APPROVAL',
        estimatedCostRef: 'C002',
        softwareName: nameOf('Adobe Creative Cloud 2026', 120),
        beneficiaryDisplayName: nameOf('Lê Hoàng Phúc', 120),
        requestedDurationLabel: fill('36 tháng', 60),
        reason: longReason(),
      }),
      item({ softwareName: nameOf('Office 365', 120), beneficiaryDisplayName: nameOf('Phạm Minh Đức', 120) }),
    );

    expect(codePoints(context.requests[2].reason)).toBe(1000);
    expect(codePoints(context.requests[3].softwareName)).toBe(120);
    expect(codePoints(context.requests[3].beneficiaryDisplayName)).toBe(120);
    const result = checked(context);

    expect(result.rejections).toEqual([]);
    expect(result.accepted.map((line) => line.sourceRef)).toEqual(['R001', 'R002', 'R003', 'R004', 'R005']);
    for (const line of result.accepted) expect(codePoints(line.summary)).toBeLessThanOrEqual(400);
  });

  it('cuts a long reason at white space only, marks the cut and stays within 400 code points', () => {
    const reason = longReason();
    const summary = simulatedSummaryOf(item({ reason }));
    const kept = summary.split('. Lý do: ')[1];

    expect(codePoints(summary)).toBeLessThanOrEqual(QUEUE_TEXT_LIMITS.summary);
    expect(kept.endsWith('…')).toBe(true);
    const words = kept.slice(0, -1).split(' ');
    expect(reason.split(/\s+/u).slice(0, words.length)).toEqual(words);
  });

  it('never cuts inside a number, even when the room ends in the middle of one', () => {
    const head = 'Bước duyệt chi X cho Y. Lý do: ';
    for (let pad = 300; pad < 400; pad += 1) {
      const reason = `${'a'.repeat(pad - codePoints(head))} 20261108 năm 2026`;
      const spend = item({
        stepKind: 'SPEND_APPROVAL',
        softwareName: 'X',
        beneficiaryDisplayName: 'Y',
        requestedDurationLabel: null,
        reason,
      });
      const summary = simulatedSummaryOf(spend);

      expect(codePoints(summary)).toBeLessThanOrEqual(400);
      expect(checked(contextOf(spend)).rejections).toEqual([]);
      expect(summary).not.toMatch(/(?<!\d)(?:2|20|202|2026|20261|202611|2026110)…/u);
    }
  });

  it('drops the reason part when not even its first word fits beside the longest fixed text', () => {
    const spend = item({
      stepKind: 'SPEND_APPROVAL',
      estimatedCostRef: 'C001',
      softwareName: fill('Miro', 120),
      beneficiaryDisplayName: fill('Ngô Thị Lan', 120),
      requestedDurationLabel: fill('6 tháng', 60),
      reason: 'b'.repeat(1000),
    });
    const summary = simulatedSummaryOf(spend);

    expect(summary).not.toContain('Lý do');
    expect(codePoints(summary)).toBe(363);
    expect(checked(contextOf(spend)).rejections).toEqual([]);
  });

  it.each([
    ['a link in the reason', { reason: 'Xem tài liệu tại https://example.com/docs' }, ['URL_PRESENT']],
    ['advice in the reason', { reason: 'Việc này nên duyệt gấp' }, ['ADVICE_LANGUAGE']],
    ['a name with an English stem of risk', { softwareName: 'RiskLens' }, ['ADVICE_LANGUAGE']],
  ])(
    'lets the backend reject a line built from %s, with its code, as it rejects a line of the model',
    (_name, overrides, codes) => {
      const context = contextOf(item(), item(overrides));
      const result = checked(context);

      expect(result.accepted.map((line) => line.sourceRef)).toEqual(['R001']);
      expect(result.rejections).toEqual(codes.map((code) => ({ code, sourceRef: 'R002' })));
    },
  );

  it('answers in the shape of the contract, one line per step in the order of the context', () => {
    const context = contextOf(item(), item({ stepKind: 'SPEND_APPROVAL', estimatedCostRef: 'C001' }));
    const answer = simulatedQueueAnswer(
      { contractVersion: '1', invocationId: '0b7c4a7e-5d0e-4c8e-9c0a-3f1d2a9b8c11', locale: 'vi', context },
      1503.6,
    );

    expect(queueSummaryServiceResponseSchema.safeParse(answer).success).toBe(true);
    expect(answer).toMatchObject({
      contractVersion: '1',
      invocationId: '0b7c4a7e-5d0e-4c8e-9c0a-3f1d2a9b8c11',
      modelId: 'saas-sentry-simulated',
      modelRevision: 'v1',
      promptVersion: 'simulated-v1',
      schemaVersion: 'aqs-schema-v1',
      promptText: '[SIMULATED] Không gọi model.',
      parseStatus: 'OK',
      usage: { promptTokens: 0, completionTokens: 0 },
      latencyMs: 1504,
    });
    expect(SIMULATED_IDENTITY).toEqual({
      modelId: 'saas-sentry-simulated',
      modelRevision: 'v1',
      promptVersion: 'simulated-v1',
      schemaVersion: 'aqs-schema-v1',
    });
    expect(SIMULATED_PROMPT_TEXT).toBe('[SIMULATED] Không gọi model.');
    expect(answer.parsed?.items.map((line) => [line.sourceRef, line.stepKind])).toEqual([
      ['R001', 'NEED_APPROVAL'],
      ['R002', 'SPEND_APPROVAL'],
    ]);
    expect(answer.rawResponse).toBe(JSON.stringify(answer.parsed));
  });

  it('answers an empty queue with no line, and a full queue with one line per step', () => {
    const request = (context: QueueContext) => ({
      contractVersion: '1' as const,
      invocationId: '0b7c4a7e-5d0e-4c8e-9c0a-3f1d2a9b8c11',
      locale: 'vi' as const,
      context,
    });
    const full = contextOf(...Array.from({ length: QUEUE_MAX_REQUESTS }, () => item()));

    expect(simulatedQueueAnswer(request(contextOf()), 0).parsed).toEqual({ items: [] });
    expect(simulatedQueueAnswer(request(full), 0).parsed?.items).toHaveLength(QUEUE_MAX_REQUESTS);
  });
});
