import type { InAppParamValue } from '../../../notifications/public/notifications.types';
import {
  NO_FACTS,
  type FactNeed,
  type PlannedNotification,
  type StatusEvent,
  type StatusFacts,
  type StatusRule,
} from '../request-status.types';
import { BUDGET_CHECK_RULES } from './status-rules-budget-check.policy';
import { GROUP_RULES } from './status-rules-group.policy';
import { OUTCOME_RULES } from './status-rules-outcome.policy';
import { PROGRESS_RULES } from './status-rules-progress.policy';
import { RELATED_RULES } from './status-rules-related.policy';
import { text } from './status-rule.policy';
import { WITHDRAWAL_RULES } from './status-rules-withdrawal.policy';

/**
 * The table of events of the inbox: every audit event that tells somebody something, with the rule that says whom and what. It
 * is the one place to extend. An item that has an event to tell (the reminders of a late step, the congestion alerts) writes its
 * rules in a table of its own beside these, lists it below, and adds its codes and parameter keys to the table of the inbox
 * (`PARAM_KEYS_BY_CODE`); `PROJECTED_ACTIONS` and the facts to read follow from the rules, so the projection needs no change.
 */
const RULES: Readonly<Record<string, StatusRule>> = {
  ...PROGRESS_RULES,
  ...OUTCOME_RULES,
  ...WITHDRAWAL_RULES,
  ...RELATED_RULES,
  ...GROUP_RULES,
  ...BUDGET_CHECK_RULES,
};

/** The actions the projection reads from the trail: those of the table, and no others. */
export const PROJECTED_ACTIONS: readonly string[] = Object.keys(RULES);

/** The longest text of a parameter a notice keeps; the full reason stays on the request (the whole of the parameters is 4 096 bytes). */
export const MAX_PARAM_TEXT = 1000;

export function ruleFor(action: string): StatusRule | null {
  return RULES[action] ?? null;
}

/** What has to be read before the event of this action can be judged; nothing for an action the table does not know. */
export function needsOf(action: string): readonly FactNeed[] {
  return RULES[action]?.needs ?? [];
}

/** The id of what the event is about, from its payload: the request, or the return of a seat. */
export function subjectIdOf(event: StatusEvent): string | null {
  const rule = RULES[event.action];
  if (!rule) return null;

  return text(event.after, rule.subject === 'RETURN_REQUEST' ? 'returnRequestId' : 'requestId');
}

function clip(value: InAppParamValue): InAppParamValue {
  return typeof value === 'string' && value.length > MAX_PARAM_TEXT ? value.slice(0, MAX_PARAM_TEXT) : value;
}

/**
 * The notices an audit event makes, given the facts read after it. The person who caused the event is not told about it, unless
 * the rule says that is the point (the requester who sent the request); a person named twice is told once for each code; the key
 * that makes a notice once for a recipient is made from the event, the code and the person the event is about when it is about
 * one person of a request for a group, unless the rule gives its own. An event the table does not know, one with no id of what it is
 * about, or one whose rule needs the request when there is none, makes nothing.
 */
export function plan(event: StatusEvent, facts: StatusFacts = NO_FACTS): PlannedNotification[] {
  const rule = RULES[event.action];
  const subjectId = subjectIdOf(event);
  if (!rule || subjectId === null) return [];
  if (rule.needs.includes('REQUEST') && facts.request === null) return [];

  const beneficiary = text(event.after, 'beneficiaryEmployeeId') ?? '-';
  const planned: PlannedNotification[] = [];
  for (const intent of rule.build(event, facts)) {
    const told = new Set<string>();
    for (const recipient of intent.recipients) {
      if (recipient === null || told.has(recipient)) continue;
      if (!intent.includeActor && recipient === event.actorEmployeeId) continue;
      told.add(recipient);
      planned.push({
        organizationId: event.organizationId,
        recipientEmployeeId: recipient,
        code: intent.code,
        subject: { type: rule.subject, id: subjectId },
        params: Object.fromEntries(Object.entries(intent.params).map(([key, value]) => [key, clip(value)])),
        eventKey: intent.key ?? `AUD:${event.id}:${intent.code}:${beneficiary}`,
      });
    }
  }

  return planned;
}
