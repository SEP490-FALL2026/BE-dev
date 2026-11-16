import type { DemoRunContext } from '../demo-run.types';

/** A small PDF the demo attaches (made up, no real document and no picture of a person). */
export const SAMPLE_PDF = new TextEncoder().encode(
  '%PDF-1.4\n% SaaS-Sentry demo dataset: sample attachment\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n',
);

interface Declared {
  attachment: { id: string };
  upload: { url: string; headers: Record<string, string> };
}

/**
 * Declares a budget file at `declarePath` (`POST /budget-proposals/attachments` or `POST /budget-versions/{id}/attachments`), puts its
 * bytes at the link the API gives and completes it, as the account of `email`. Returns the id of the file.
 */
export async function uploadBudgetFile(
  ctx: DemoRunContext,
  email: string,
  declarePath: string,
  fileName: string,
): Promise<string> {
  const declared = await ctx.api.call<Declared>(email, 'POST', declarePath, {
    fileName,
    contentType: 'application/pdf',
    sizeBytes: SAMPLE_PDF.length,
  });
  await ctx.api.putFile(declared.upload.url, declared.upload.headers, SAMPLE_PDF);
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
  purpose: 'CONTRACT_ATTACHMENT' | 'PURCHASE_DOCUMENT',
  fileName: string,
): Promise<string> {
  const declared = await ctx.api.call<DeclaredDocument>(email, 'POST', '/documents', {
    fileName,
    contentType: 'application/pdf',
    sizeBytes: SAMPLE_PDF.length,
    purpose,
  });
  await ctx.api.putFile(declared.upload.url, declared.upload.headers, SAMPLE_PDF);
  await ctx.api.call(email, 'POST', `/documents/${declared.document.id}/complete`);

  return declared.document.id;
}
