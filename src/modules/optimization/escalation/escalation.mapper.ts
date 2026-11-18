import type { escalationSchema } from './escalation.dto';
import type { EscalationOutcome } from './escalation.types';
import type { z } from 'zod';

/** The wire answer of a batch: one flat row for each recommendation, in the order they were named. */
export function toEscalationWire(outcome: EscalationOutcome): z.output<typeof escalationSchema> {
  const results = outcome.results.map((result) =>
    result.outcome === 'ESCALATED'
      ? {
          recommendationId: result.recommendationId,
          outcome: result.outcome,
          reason: null,
          state: result.state,
          departmentId: result.departmentId,
        }
      : {
          recommendationId: result.recommendationId,
          outcome: result.outcome,
          reason: result.reason,
          state: null,
          departmentId: null,
        },
  );
  const escalated = results.filter((result) => result.outcome === 'ESCALATED').length;

  return { id: outcome.id, escalated, skipped: results.length - escalated, replayed: outcome.replayed, results };
}
