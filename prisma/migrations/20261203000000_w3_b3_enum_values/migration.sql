-- W3-15, W3-20 (P11 M5a): add the two enum values the seat purchase invoice and the lot invoice need.
-- Irreversible (DB-05): PostgreSQL `ALTER TYPE ... ADD VALUE` cannot be dropped without recreating the enum type.
-- Keep this migration minimal; do not reference the new values in queries or defaults in the same transaction.

ALTER TYPE "PurchaseInvoiceLabel" ADD VALUE IF NOT EXISTS 'SEAT_PURCHASE';
ALTER TYPE "PurchaseInvoiceLinkKind" ADD VALUE IF NOT EXISTS 'LICENSE_LOT';
