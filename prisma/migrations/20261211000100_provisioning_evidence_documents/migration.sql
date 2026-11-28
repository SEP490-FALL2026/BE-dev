-- An evidence file belongs once to the task it completed; the existing one-way guard keeps it immutable.
ALTER TABLE "document_attachments" ADD COLUMN "provisioning_task_id" uuid;
CREATE INDEX "document_attachments_provisioning_task_id_idx" ON "document_attachments" ("provisioning_task_id");

ALTER TABLE "document_attachments" DROP CONSTRAINT IF EXISTS "document_attachments_owner_state",
  DROP CONSTRAINT IF EXISTS "document_attachments_purpose_fits_owner";
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_owner_state" CHECK (
    ("status" = 'READY') = ("contract_id" IS NOT NULL OR "signer_employee_id" IS NOT NULL OR "purchase_invoice_id" IS NOT NULL
        OR "out_of_process_case_id" IS NOT NULL OR "provisioning_task_id" IS NOT NULL)
    AND ("status" = 'READY') = ("attached_at" IS NOT NULL)
    AND num_nonnulls("contract_id", "signer_employee_id", "purchase_invoice_id", "out_of_process_case_id", "provisioning_task_id") <= 1),
  ADD CONSTRAINT "document_attachments_purpose_fits_owner" CHECK (
    ("contract_id" IS NULL OR "purpose" IN ('CONTRACT_ATTACHMENT', 'PURCHASE_DOCUMENT'))
    AND ("signer_employee_id" IS NULL OR "purpose" = 'SIGNATURE_RECORD')
    AND ("purchase_invoice_id" IS NULL OR "purpose" = 'PURCHASE_DOCUMENT')
    AND ("out_of_process_case_id" IS NULL OR "purpose" = 'PURCHASE_DOCUMENT')
    AND ("provisioning_task_id" IS NULL OR "purpose" IN ('PROVISIONING_EVIDENCE', 'ACCESS_CUT_EVIDENCE')));
