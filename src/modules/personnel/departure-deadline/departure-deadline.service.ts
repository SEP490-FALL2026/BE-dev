import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../core/business-date';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { deadlineWindowEnd, revocationDueOn } from './departure-deadline.policy';

/**
 * The deadline of the revocations of a departure (`QĐ-110c`, `M-09`): `DEPARTURE_REVOCATION_WORKING_DAYS` working days from the day after
 * the last working day, over the days off of the calendar of the organization. The one reading of the parameter and the calendar, shared
 * by the preview and the record of a departure (which keep the day on the case) and by the move of the last working day (which keeps it
 * in step). Reads only; the caller writes the day.
 */
@Injectable()
export class DepartureDeadlineService {
  constructor(private readonly parameters: OperatingParametersApi) {}

  /** The day the IT Admin has until, for a departure whose last working day is `lastWorkingDay`. */
  async revocationDueOn(lastWorkingDay: BusinessDate): Promise<BusinessDate> {
    const days = Number(await this.parameters.getValue('DEPARTURE_REVOCATION_WORKING_DAYS'));
    const nonWorking = await this.parameters.getNonWorkingDates(
      addDays(lastWorkingDay, 1),
      deadlineWindowEnd(lastWorkingDay),
    );

    return revocationDueOn(lastWorkingDay, days, nonWorking);
  }
}
