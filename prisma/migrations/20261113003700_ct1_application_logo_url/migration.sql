-- CT-1.L1: an application may carry the link to its logo image, which the IT Admin pastes (nothing is uploaded and the server never fetches it).
-- Expand only: one nullable column and one CHECK on it; every row stands as it was (none has a logo) and nothing is dropped. Safe to run twice.
--
-- The CHECK says what the request schema says, so a row written another way cannot hold a link that is not https or is longer than 500 characters.
-- Asked on its own column: it passes on NULL.

ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "logo_url" TEXT;

ALTER TABLE "applications" DROP CONSTRAINT IF EXISTS "applications_logo_url_https";
ALTER TABLE "applications" ADD CONSTRAINT "applications_logo_url_https" CHECK (
    "logo_url" IS NULL OR ("logo_url" ~* '^https://[^[:space:]]+$' AND char_length("logo_url") <= 500)
);
