import { randomUUID } from 'node:crypto';
import {
  ConfirmSeatImportBodyDto,
  UploadSeatImportBodyDto,
} from '../../../src/modules/data-import/seat-baseline-import/seat-baseline-import.dto';
import { SeatBaselineImportService } from '../../../src/modules/data-import/seat-baseline-import/seat-baseline-import.service';
import { ListAssignmentsQueryDto } from '../../../src/modules/licensing/assignment/assignment.dto';
import { AssignmentListService } from '../../../src/modules/licensing/assignment/assignment-list.service';
import type { HttpTestApp } from '../http-test-app';
import { principalOf, sent } from './account.builder';

/*
 * T2.2: the seats a suite only stands on — a seat baseline file uploaded and confirmed by the IT Admin, and the assignment it
 * made looked up the way the list of assignments finds it — through the services of `POST /seat-baseline-imports`,
 * `POST /seat-baseline-imports/{id}/confirm` and `GET /license-assignments`, not HTTP (see organization.builder.ts). The suites
 * of the seat baseline import call the routes. No assertion lives here.
 */

/** The IT Admin uploads the file for one subscription or one internal plan and confirms its preview at once. */
export async function importSeats(
  ctx: HttpTestApp,
  itAdminToken: string,
  target: { subscriptionId?: string; planId?: string },
  bytes: Buffer,
): Promise<void> {
  const actor = await principalOf(ctx, itAdminToken);
  const imports = ctx.app.get(SeatBaselineImportService, { strict: false });
  const fields = UploadSeatImportBodyDto.create(sent(target));
  const preview = await imports.upload(actor, {
    fileName: 'seats.csv',
    bytes,
    ...(fields.subscriptionId ? { subscriptionId: fields.subscriptionId } : {}),
    ...(fields.planId ? { planId: fields.planId } : {}),
  });
  await imports.confirm(
    actor,
    preview.id,
    ConfirmSeatImportBodyDto.create({ previewVersion: preview.previewVersion, idempotencyKey: randomUUID() }),
  );
}

/** The id of the person's assignment in the first page of 100 the list of assignments gives for the filter, if any. */
export async function assignmentIdOf(
  ctx: HttpTestApp,
  filter: Record<string, string>,
  employeeId: string,
): Promise<string | undefined> {
  const page = await ctx.app
    .get(AssignmentListService, { strict: false })
    .list(ListAssignmentsQueryDto.create({ pageSize: '100', ...filter }));

  return page.items.find((assignment) => assignment.employeeId === employeeId)?.id;
}
