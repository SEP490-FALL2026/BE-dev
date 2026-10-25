import { Injectable } from '@nestjs/common';
import { BacklogAlertService } from './sla/backlog-alert.service';
import { StepSlaService } from './sla/step-sla.service';

/** What one pass wrote: the reminders of the steps and of the queue of the head, and the alerts of a backlog. */
export interface StepSlaSweepResult {
  /** False when the day is not a working day: the pass did nothing. */
  workingDay: boolean;
  stepsReminded: number;
  queueReminded: number;
  backlogAlerts: number;
  failed: number;
}

/**
 * What the worker's loop calls to remind the people who hold a step that is late, and to tell the Super Admin of a backlog
 * (`US-05-09`, `US-05-10`): one pass of the reminders and one of the alerts. The work itself is the capability `sla/`; this is the
 * one entry the composition root is given, so the loop does not reach into the context. A pass writes only reminders, notices of
 * the inbox and audit events: it never changes a step, a request or a decision.
 */
@Injectable()
export class StepSlaSweepService {
  constructor(
    private readonly steps: StepSlaService,
    private readonly backlog: BacklogAlertService,
  ) {}

  /** One pass at `now`. The alerts run even when the reminders failed, and the first failure is raised after both have run. */
  async sweep(now: Date = new Date()): Promise<StepSlaSweepResult> {
    let failure: unknown = null;
    const reminders = await this.steps.sweep(now).catch((error: unknown) => {
      failure = error;

      return { workingDay: false, stepsReminded: 0, queueReminded: 0, failed: 0 };
    });
    const alerts = await this.backlog.alert(now).catch((error: unknown) => {
      failure ??= error;

      return { alerted: 0, failed: 0 };
    });
    if (failure !== null) throw failure instanceof Error ? failure : new Error('The reminders failed');

    return {
      workingDay: reminders.workingDay,
      stepsReminded: reminders.stepsReminded,
      queueReminded: reminders.queueReminded,
      backlogAlerts: alerts.alerted,
      failed: reminders.failed + alerts.failed,
    };
  }
}
