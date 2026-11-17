-- US-2.2 (QĐ-111ay): the IT Admin pushes recommendations of the watch tier to the head of the department before the weekly pass does, in a batch
-- that comes with an Idempotency-Key. This table keeps one row for each key of a person: the fingerprint of what the batch asked (so the same key
-- for another list is refused), the note of the IT Admin and what it answered (so the same key again answers the same result and never acts twice).
-- Only a table is added: no column of an existing table changes, nothing is backfilled and nothing is dropped. Safe to run twice (IF NOT EXISTS).
-- The ids of other modules are values, not foreign keys.
CREATE TABLE IF NOT EXISTS "ghost_seat_escalations" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" uuid NOT NULL,
    "requested_by_app_user_id" uuid NOT NULL,
    "idempotency_key_hash" text NOT NULL,
    "request_hash" text NOT NULL,
    "note" text,
    "results" jsonb NOT NULL DEFAULT '[]',
    "created_at" timestamptz(3) NOT NULL DEFAULT now(),
    CONSTRAINT "ghost_seat_escalations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ghost_seat_escalations_key" UNIQUE ("organization_id", "requested_by_app_user_id", "idempotency_key_hash"),
    CONSTRAINT "ghost_seat_escalations_note" CHECK ("note" IS NULL OR char_length("note") BETWEEN 1 AND 500),
    CONSTRAINT "ghost_seat_escalations_results" CHECK (jsonb_typeof("results") = 'array')
);
