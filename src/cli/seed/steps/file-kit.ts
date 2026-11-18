import type { DemoRunContext } from '../demo-run.types';
import type { BuiltFile } from './file-builders';

interface Declared {
  attachment: { id: string };
  upload: { url: string; headers: Record<string, string> };
}

/**
 * Declares a budget file at `declarePath` (`POST /budget-proposals/attachments` or `POST /budget-versions/{id}/attachments`), puts its
 * bytes at the link the API gives and completes it, as the account of `email`. The file is a real one (SPEC S23), named and typed as it is.
 * Returns the id of the file.
 */
export async function uploadBudgetFile(
  ctx: DemoRunContext,
  email: string,
  declarePath: string,
  file: BuiltFile,
): Promise<string> {
  const declared = await ctx.api.call<Declared>(email, 'POST', declarePath, {
    fileName: file.fileName,
    contentType: file.contentType,
    sizeBytes: file.bytes.length,
  });
  await ctx.api.putFile(declared.upload.url, declared.upload.headers, file.bytes);
  await ctx.api.call(email, 'POST', `/budget-attachments/${declared.attachment.id}/complete`);

  return declared.attachment.id;
}

interface DeclaredDocument {
  document: { id: string };
  upload: { url: string; headers: Record<string, string> };
}

/**
 * Uploads a document (`POST /documents` → PUT at the link → `POST /documents/{id}/complete`) as the account of `email`, for a contract
 * (`CONTRACT_ATTACHMENT`) or a purchase (`PURCHASE_DOCUMENT`: invoices, proofs of an out-of-process purchase). Returns the id of the document.
 */
export async function uploadDocument(
  ctx: DemoRunContext,
  email: string,
  purpose: 'CONTRACT_ATTACHMENT' | 'PURCHASE_DOCUMENT' | 'SIGNATURE_RECORD',
  file: BuiltFile,
): Promise<string> {
  const declared = await ctx.api.call<DeclaredDocument>(email, 'POST', '/documents', {
    fileName: file.fileName,
    contentType: file.contentType,
    sizeBytes: file.bytes.length,
    purpose,
  });
  await ctx.api.putFile(declared.upload.url, declared.upload.headers, file.bytes);
  await ctx.api.call(email, 'POST', `/documents/${declared.document.id}/complete`);

  return declared.document.id;
}
