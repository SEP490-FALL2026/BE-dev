-- QĐ-110m, R-9 (X-SA.1a): no service account any more. An IT Admin keeps one personal seat of a subscription for their own work (INV-02)
-- and may hold, on the same subscription, a seat they flag as "used for a machine account" (a pipeline, a bot, a shared tool login), which is
-- an ordinary personal seat with a flag. This migration only prepares the ground: the flag and its note, the INV-02 constraint that leaves
-- a flagged seat out, and the source of the rows the next migrations write. It moves no data (`_licensing_service_accounts_converted` does,
-- after the values it needs); it must run before that one so the converted rows are accepted. Forward only: nothing is dropped or deleted.

-- 1. The flag and the reason for it. The note is the reason the seat is a machine account, read by the IT Admin who answers for it; it is
-- present exactly when the flag is on (a flagged seat without a reason says nothing). Each column of the check is tested on its own
-- (`IS NOT NULL`): a check passes on NULL. Only a personal seat carries the flag; a service account row (kept as history) never does.
ALTER TABLE "license_assignments"
    ADD COLUMN "is_machine_account" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "machine_account_note" TEXT;

ALTER TABLE "license_assignments"
    ADD CONSTRAINT "license_assignments_machine_account_note_check" CHECK (
        (
            "is_machine_account" = true
            AND "machine_account_note" IS NOT NULL
            AND length(btrim("machine_account_note")) > 0
        )
        OR (
            "is_machine_account" = false
            AND "machine_account_note" IS NULL
        )
    ),
    ADD CONSTRAINT "license_assignments_machine_account_personal_check" CHECK (
        "is_machine_account" = false
        OR "kind" = 'PERSONAL'
    );

-- 2. INV-02 (R-9): a person is not on one subscription twice at once with a personal seat, a seat flagged as a machine account apart. The
-- flag is a column of the row, so a seat that is flagged or unflagged later is judged again by the constraint on that update: turning the
-- flag off while the person holds another personal seat of the subscription for an overlapping period is refused (23P01).
ALTER TABLE "license_assignments" DROP CONSTRAINT "license_assignments_personal_no_overlap";
ALTER TABLE "license_assignments"
    ADD CONSTRAINT "license_assignments_personal_no_overlap"
    EXCLUDE USING gist (
        (COALESCE("subscription_id", "plan_id")) WITH =,
        "employee_id" WITH =,
        daterange("valid_from", "valid_until", '[)') WITH &&
    ) WHERE ("kind" = 'PERSONAL' AND NOT "is_machine_account");

-- 3. A converted seat names the service account seat it continues, like a handover or a renewal carry. The rest of the rule is the latest
-- definition (20261101000200).
ALTER TABLE "license_assignments" DROP CONSTRAINT "license_assignments_handover_names_predecessor";
ALTER TABLE "license_assignments"
    ADD CONSTRAINT "license_assignments_handover_names_predecessor" CHECK (
        ("source" = 'HANDOVER' AND "predecessor_id" IS NOT NULL)
        OR ("source" = 'REQUEST')
        OR ("source" = 'BASELINE' AND "predecessor_id" IS NULL)
        OR ("source" = 'RENEWAL_CARRY' AND "predecessor_id" IS NOT NULL)
        OR ("source" = 'MACHINE_ACCOUNT_CONVERSION' AND "predecessor_id" IS NOT NULL)
    );
