import type { FlowWorld } from './flow-world';

const PDF = 'application/pdf';

/**
 * A budget file as the screen uploads it (`QĐ-111ab`): `code` declares it at `declarePath` (`/budget-proposals/attachments` for `BM-10`,
 * `/budget-versions/{id}/attachments` for a version), the browser puts the bytes in the (fake) storage, then `code` completes it. Returns
 * the id of the file; fails on any answer but the expected one.
 */
export async function budgetFile(world: FlowWorld, code: string, declarePath: string): Promise<string> {
  const declared = await world.calls.post(code, declarePath, {
    fileName: 'bm-10.pdf',
    contentType: PDF,
    sizeBytes: 2048,
  });
  if (declared.status !== 201) throw new Error(`declare answered ${declared.status}: ${JSON.stringify(declared.body)}`);
  const id = world.calls.data<{ attachment: { id: string } }>(declared).attachment.id;
  const key = (
    await world.facts.one<{ object_key: string }>(`SELECT object_key FROM budget_attachments WHERE id = $1`, [id])
  ).object_key;
  world.storage.put(key, { contentLength: 2048, contentType: PDF });
  const completed = await world.calls.post(code, `/budget-attachments/${id}/complete`);
  if (completed.status !== 200)
    throw new Error(`complete answered ${completed.status}: ${JSON.stringify(completed.body)}`);

  return id;
}

/** The body of `BM-10` of a year: one amount and the files, uploaded first by the head. */
export async function bm10Body(world: FlowWorld, headCode: string, year: number, amount: string) {
  const file = await budgetFile(world, headCode, '/budget-proposals/attachments');

  return { year, requestedAmount: { amount }, attachmentIds: [file] };
}
