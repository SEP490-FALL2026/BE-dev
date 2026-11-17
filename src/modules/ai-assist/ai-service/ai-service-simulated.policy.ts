import {
  AI_CONTRACT_VERSION,
  QUEUE_TEXT_LIMITS,
  type QueueRequestItem,
  type QueueSummaryParsed,
  type QueueSummaryServiceRequest,
  type QueueSummaryServiceResponse,
} from './ai-service.types';

/**
 * The lines of the simulated source of answers (`AI_PROVIDER_MODE = SIMULATED`): each step of the context written into a fixed
 * Vietnamese template from its own fields, without any model. The lines then go through the same checks of the backend as the
 * lines of a model, so the fixed words of the templates hold no word of advice, decision, claim, number or unit those checks
 * refuse; a source that holds one (a link, advice in the reason, a name such as "RiskLens") loses its line, as it would with a
 * model. Nothing here is filtered beforehand.
 */

/** What an answer of the simulation records in place of a model, so its calls are told apart from those of a model. */
export const SIMULATED_IDENTITY = {
  modelId: 'saas-sentry-simulated',
  modelRevision: 'v1',
  promptVersion: 'simulated-v1',
  schemaVersion: 'aqs-schema-v1',
} as const;

export const SIMULATED_PROMPT_TEXT = '[SIMULATED] Không gọi model.';

const REASON_LEAD = '. Lý do: ';
const CUT_MARK = '…';

const codePoints = (text: string) => [...text].length;

/** The line without its reason: who asks for what on a need step, or the spend step with the placeholder of its cost. */
function headOf(item: QueueRequestItem): string {
  const duration = item.requestedDurationLabel === null ? '' : `, thời hạn ${item.requestedDurationLabel}`;
  if (item.stepKind === 'NEED_APPROVAL') {
    return `${item.beneficiaryDisplayName} đề nghị dùng ${item.softwareName}${duration}`;
  }
  const cost = item.estimatedCostRef === null ? '' : `, chi phí ước tính {{cost:${item.estimatedCostRef}}}`;

  return `Bước duyệt chi ${item.softwareName} cho ${item.beneficiaryDisplayName}${cost}${duration}`;
}

/**
 * The reason in at most `room` code points, its white space read as single spaces: whole when it fits, otherwise its first words
 * and the cut mark. It is cut only between words, never inside a word or a number (a year cut to "20" would be a number the source
 * does not have). Null when it has no word, or when not even its first word fits.
 */
function shortenedReason(reason: string, room: number): string | null {
  const words = reason.split(/\s+/u).filter((word) => word !== '');
  const whole = words.join(' ');
  if (whole === '') return null;
  if (codePoints(whole) <= room) return whole;

  let kept = '';
  for (const word of words) {
    const next = kept === '' ? word : `${kept} ${word}`;
    if (codePoints(next) + codePoints(CUT_MARK) > room) break;
    kept = next;
  }

  return kept === '' ? null : `${kept}${CUT_MARK}`;
}

/**
 * The simulated line of one step, at most 400 code points. The longest fixed text (both names at 120, the cost placeholder and a
 * 60-character duration) is 363 code points, so the reason always has some room; when even its first word does not fit, the
 * line ends without the reason part.
 */
export function simulatedSummaryOf(item: QueueRequestItem): string {
  const head = headOf(item);
  const reason = shortenedReason(item.reason, QUEUE_TEXT_LIMITS.summary - codePoints(head) - codePoints(REASON_LEAD));

  return reason === null ? head : `${head}${REASON_LEAD}${reason}`;
}

/**
 * The answer of the simulation to one request, in the shape of the contract: one line per step, in the order of the context,
 * `parseStatus` `OK`, no tokens, and `latencyMs` the time it took in whole milliseconds.
 */
export function simulatedQueueAnswer(
  request: QueueSummaryServiceRequest,
  elapsedMs: number,
): QueueSummaryServiceResponse {
  const parsed: QueueSummaryParsed = {
    items: request.context.requests.map((item) => ({
      sourceRef: item.sourceRef,
      stepKind: item.stepKind,
      summary: simulatedSummaryOf(item),
    })),
  };

  return {
    contractVersion: AI_CONTRACT_VERSION,
    invocationId: request.invocationId,
    ...SIMULATED_IDENTITY,
    promptText: SIMULATED_PROMPT_TEXT,
    rawResponse: JSON.stringify(parsed),
    parsed,
    parseStatus: 'OK',
    usage: { promptTokens: 0, completionTokens: 0 },
    latencyMs: Math.max(0, Math.round(elapsedMs)),
  };
}
