-- W3-15, W3-16, W3-20 (P11 M5): the lines of a subscription period, the append-only ledger of seats, the targets locked at renewal.
-- One line per (period, plan); the seats a line serves on a day are the sum of its ledger up to that day (or, for a line with no ledger,
-- the `purchased_quantity` of the period). Nothing is dropped: `subscriptions.plan_id`, `purchased_quantity`, `vendor_minimum_seats`,
-- `unit_price_*` and `is_primary_for_plan` stay as they were, for data older than the ledger.
-- Reversal (before any ledger row is written): drop the triggers, the five new tables, the sequence and the new columns, then restore
-- `subscriptions_fit_plan`, `license_assignment_check_capacity` and `purchase_invoices_guard` from the migrations named below.

-- 1. Check before: a live (workspace, plan) with two periods cannot be turned into two lines (QĐ-116ag). The Owner merges the seats into one
-- subscription before this deploys. The same goes for a period of seats that has no workspace (P9b gives every one of them one).
DO $$
DECLARE
    duplicated RECORD;
BEGIN
    FOR duplicated IN
        SELECT s."workspace_id", s."plan_id", count(*) AS "periods"
          FROM "subscriptions" s JOIN "plans" p ON p."id" = s."plan_id"
         WHERE p."provisioning_type" = 'K2' AND s."kind" = 'TERM'
           AND NOT EXISTS (SELECT 1 FROM "subscriptions" n WHERE n."renewed_from_id" = s."id")
           AND (s."status" = 'DRAFT' OR s."end_date" IS NULL OR s."end_date" >= CURRENT_DATE)
         GROUP BY 1, 2 HAVING count(*) > 1
         LIMIT 1
    LOOP
        RAISE EXCEPTION 'workspace % has % live periods of the plan %: merge their seats into one subscription before this migration',
            duplicated."workspace_id", duplicated."periods", duplicated."plan_id"
            USING ERRCODE = '23505', CONSTRAINT = 'subscription_lines_workspace_plan_live';
    END LOOP;
    IF EXISTS (
        SELECT 1 FROM "subscriptions" s JOIN "plans" p ON p."id" = s."plan_id"
         WHERE p."provisioning_type" = 'K2' AND s."kind" = 'TERM' AND s."workspace_id" IS NULL
    ) THEN
        RAISE EXCEPTION 'a period of seats has no workspace: give it one before this migration'
            USING ERRCODE = '23514', CONSTRAINT = 'subscription_lines_workspace_required';
    END IF;
END $$;

-- 2. The tables.
CREATE SEQUENCE "seat_purchase_code_seq" AS INTEGER MINVALUE 1 MAXVALUE 999999;

CREATE TABLE "subscription_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "monthly_unit_price_minor" BIGINT NOT NULL,
    "minimum_seats" INTEGER,
    "ledger_opened_on" DATE,
    "renewed_from_line_id" UUID,
    "closed_on" DATE,
    "closed_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscription_lines_price_check" CHECK ("monthly_unit_price_minor" >= 0),
    CONSTRAINT "subscription_lines_minimum_seats_check" CHECK ("minimum_seats" IS NULL OR "minimum_seats" > 0),
    CONSTRAINT "subscription_lines_closed_reason_check" CHECK ("closed_reason" IS NULL OR "closed_reason" IN ('RENEWED', 'ENDED', 'REMOVED')),
    CONSTRAINT "subscription_lines_closed_pair_check" CHECK (("closed_on" IS NULL) = ("closed_reason" IS NULL)),
    CONSTRAINT "subscription_lines_ledger_before_close_check" CHECK ("ledger_opened_on" IS NULL OR "closed_on" IS NULL OR "ledger_opened_on" <= "closed_on")
);

CREATE TABLE "seat_purchases" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subscription_line_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "purchased_on" DATE NOT NULL,
    "quantity" INTEGER NOT NULL,
    "invoice_obligation" TEXT NOT NULL,
    "invoice_due_on" DATE,
    "recorded_by_employee_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seat_purchases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "seat_purchases_code_check" CHECK ("code" ~ '^MUA-[0-9]{6}$'),
    CONSTRAINT "seat_purchases_kind_check" CHECK ("kind" IN ('TOP_UP', 'TIER_STEP')),
    CONSTRAINT "seat_purchases_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "seat_purchases_obligation_check" CHECK ("invoice_obligation" IN ('WORKING_DAYS', 'NONE', 'LATE_INVOICE')),
    CONSTRAINT "seat_purchases_due_check" CHECK (("invoice_due_on" IS NULL) = ("invoice_obligation" = 'NONE'))
);

CREATE TABLE "seat_changes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subscription_line_id" UUID NOT NULL,
    "effective_on" DATE NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "request_id" UUID,
    "beneficiary_employee_id" UUID,
    "seat_purchase_id" UUID,
    "renewal_id" UUID,
    "refunded_seat_change_id" UUID,
    "note" TEXT,
    "out_of_process" BOOLEAN NOT NULL DEFAULT false,
    "auto_recorded" BOOLEAN NOT NULL DEFAULT false,
    "recorded_by_employee_id" UUID,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seat_changes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "seat_changes_delta_check" CHECK ("delta" <> 0),
    CONSTRAINT "seat_changes_reason_check" CHECK ("reason" IN ('INITIAL', 'TOP_UP', 'RENEWAL', 'REDUCE')),
    CONSTRAINT "seat_changes_reason_sign_check" CHECK (
        ("reason" IN ('INITIAL', 'TOP_UP', 'RENEWAL') AND "delta" > 0) OR ("reason" = 'REDUCE' AND "delta" < 0)
    ),
    CONSTRAINT "seat_changes_source_check" CHECK ("source" IN ('GRANT', 'ADJUSTMENT', 'VENDOR_RECORD', 'MEMBER')),
    CONSTRAINT "seat_changes_basis_check" CHECK ("basis" IN ('REQUEST_ITEM', 'NONE')),
    CONSTRAINT "seat_changes_basis_request_check" CHECK (("basis" = 'REQUEST_ITEM') = ("request_id" IS NOT NULL)),
    CONSTRAINT "seat_changes_beneficiary_request_check" CHECK ("beneficiary_employee_id" IS NULL OR "request_id" IS NOT NULL),
    CONSTRAINT "seat_changes_refund_reduce_check" CHECK ("refunded_seat_change_id" IS NULL OR "reason" = 'REDUCE'),
    CONSTRAINT "seat_changes_note_check" CHECK (
        ("note" IS NULL OR char_length(btrim("note")) BETWEEN 1 AND 1000)
        AND (("source" <> 'VENDOR_RECORD' AND "refunded_seat_change_id" IS NULL) OR "note" IS NOT NULL)
    ),
    -- The door says what a row may be (B2-R14).
    CONSTRAINT "seat_changes_grant_check" CHECK (
        "source" <> 'GRANT' OR ("reason" = 'TOP_UP' AND "delta" = 1 AND "basis" = 'REQUEST_ITEM'
            AND "beneficiary_employee_id" IS NOT NULL AND "seat_purchase_id" IS NOT NULL)
    ),
    CONSTRAINT "seat_changes_adjustment_check" CHECK (
        "source" <> 'ADJUSTMENT' OR ("reason" IN ('INITIAL', 'RENEWAL') AND "seat_purchase_id" IS NULL)
    ),
    CONSTRAINT "seat_changes_member_check" CHECK (
        "source" <> 'MEMBER' OR ("reason" IN ('TOP_UP', 'REDUCE') AND abs("delta") = 1 AND "seat_purchase_id" IS NULL)
    ),
    CONSTRAINT "seat_changes_vendor_tier_check" CHECK (
        "source" <> 'VENDOR_RECORD' OR "seat_purchase_id" IS NULL
        OR ("reason" = 'TOP_UP' AND "basis" = 'REQUEST_ITEM' AND "request_id" IS NOT NULL)
    )
);

CREATE TABLE "subscription_line_targets" (
    "subscription_line_id" UUID NOT NULL,
    "renewal_on" DATE NOT NULL,
    "seats_needed" INTEGER NOT NULL,
    "target" INTEGER NOT NULL,
    "recorded_quantity" INTEGER,
    "renewal_id" UUID,
    "locked_at" TIMESTAMPTZ(3) NOT NULL,
    "locked_by" TEXT NOT NULL,

    CONSTRAINT "subscription_line_targets_pkey" PRIMARY KEY ("subscription_line_id", "renewal_on"),
    CONSTRAINT "subscription_line_targets_seats_needed_check" CHECK ("seats_needed" >= 0),
    CONSTRAINT "subscription_line_targets_target_check" CHECK ("target" >= 0),
    CONSTRAINT "subscription_line_targets_recorded_quantity_check" CHECK ("recorded_quantity" IS NULL OR "recorded_quantity" >= 0),
    CONSTRAINT "subscription_line_targets_locked_by_check" CHECK ("locked_by" IN ('IT_ADMIN', 'SYSTEM'))
);

-- 3. The columns the new tables add to the old ones.
ALTER TABLE "subscription_renewals"
    ADD COLUMN "auto_recorded" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "minimum_total_holder_line_id" UUID,
    ADD COLUMN "minimum_total_note" TEXT;

ALTER TABLE "subscription_renewals" DROP CONSTRAINT "subscription_renewals_decider_role";
ALTER TABLE "subscription_renewals"
    ADD CONSTRAINT "subscription_renewals_decider_role" CHECK (
        "decider_role" IS NULL
        OR "decider_role" IN ('SPENDING_APPROVER', 'CONFLICT_SUBSTITUTE', 'OWNER_DEPARTMENT_HEAD', 'IT_ADMIN_IN_CHARGE', 'SYSTEM')
    );

ALTER TABLE "purchase_invoices"
    ADD COLUMN "seat_purchase_id" UUID,
    ADD COLUMN "subscription_line_ids" UUID[];

-- 4. Indexes and foreign keys.
CREATE UNIQUE INDEX "subscription_lines_renewed_from_line_id_key" ON "subscription_lines"("renewed_from_line_id");
CREATE UNIQUE INDEX "subscription_lines_subscription_id_plan_id_key" ON "subscription_lines"("subscription_id", "plan_id");
CREATE INDEX "subscription_lines_workspace_id_idx" ON "subscription_lines"("workspace_id");
CREATE INDEX "subscription_lines_plan_id_idx" ON "subscription_lines"("plan_id");
-- C1 (QĐ-116ag) in the database: one line per (workspace, plan) that has not been renewed, ended or removed.
CREATE UNIQUE INDEX "subscription_lines_workspace_plan_live" ON "subscription_lines"("workspace_id", "plan_id") WHERE "closed_reason" IS NULL;

CREATE UNIQUE INDEX "seat_purchases_organization_id_code_key" ON "seat_purchases"("organization_id", "code");
CREATE INDEX "seat_purchases_subscription_line_id_idx" ON "seat_purchases"("subscription_line_id");

CREATE INDEX "seat_changes_subscription_line_id_effective_on_idx" ON "seat_changes"("subscription_line_id", "effective_on");
CREATE INDEX "seat_changes_request_id_idx" ON "seat_changes"("request_id");
-- Each item awaiting a grant takes at most one TOP_UP (QĐ-116aw).
CREATE UNIQUE INDEX "seat_changes_grant_item_key" ON "seat_changes"("request_id", "beneficiary_employee_id")
    WHERE "reason" = 'TOP_UP' AND "source" = 'GRANT';

CREATE UNIQUE INDEX "purchase_invoices_seat_purchase_open_key" ON "purchase_invoices"("seat_purchase_id")
    WHERE "seat_purchase_id" IS NOT NULL AND "state" <> 'RETURNED';

ALTER TABLE "subscription_lines" ADD CONSTRAINT "subscription_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_lines" ADD CONSTRAINT "subscription_lines_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_lines" ADD CONSTRAINT "subscription_lines_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_lines" ADD CONSTRAINT "subscription_lines_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_lines" ADD CONSTRAINT "subscription_lines_renewed_from_line_id_fkey" FOREIGN KEY ("renewed_from_line_id") REFERENCES "subscription_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "seat_purchases" ADD CONSTRAINT "seat_purchases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seat_purchases" ADD CONSTRAINT "seat_purchases_subscription_line_id_fkey" FOREIGN KEY ("subscription_line_id") REFERENCES "subscription_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seat_purchases" ADD CONSTRAINT "seat_purchases_recorded_by_employee_id_fkey" FOREIGN KEY ("recorded_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "seat_changes" ADD CONSTRAINT "seat_changes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seat_changes" ADD CONSTRAINT "seat_changes_subscription_line_id_fkey" FOREIGN KEY ("subscription_line_id") REFERENCES "subscription_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seat_changes" ADD CONSTRAINT "seat_changes_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seat_changes" ADD CONSTRAINT "seat_changes_beneficiary_employee_id_fkey" FOREIGN KEY ("beneficiary_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seat_changes" ADD CONSTRAINT "seat_changes_seat_purchase_id_fkey" FOREIGN KEY ("seat_purchase_id") REFERENCES "seat_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seat_changes" ADD CONSTRAINT "seat_changes_renewal_id_fkey" FOREIGN KEY ("renewal_id") REFERENCES "subscription_renewals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seat_changes" ADD CONSTRAINT "seat_changes_refunded_seat_change_id_fkey" FOREIGN KEY ("refunded_seat_change_id") REFERENCES "seat_changes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seat_changes" ADD CONSTRAINT "seat_changes_recorded_by_employee_id_fkey" FOREIGN KEY ("recorded_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "subscription_line_targets" ADD CONSTRAINT "subscription_line_targets_subscription_line_id_fkey" FOREIGN KEY ("subscription_line_id") REFERENCES "subscription_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_line_targets" ADD CONSTRAINT "subscription_line_targets_renewal_id_fkey" FOREIGN KEY ("renewal_id") REFERENCES "subscription_renewals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "subscription_renewals" ADD CONSTRAINT "subscription_renewals_minimum_total_holder_line_id_fkey" FOREIGN KEY ("minimum_total_holder_line_id") REFERENCES "subscription_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_seat_purchase_id_fkey" FOREIGN KEY ("seat_purchase_id") REFERENCES "seat_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. The data: one line for each period of seats, then the opening row of the ledger of each line that has one (KHO-28).
-- Decision: a period that is active, has no successor and ended before the conversion day is `ENDED` whether or not it renews itself,
-- the rule the check before uses for "live"; so two such periods of one (workspace, plan) never meet in the unique index.
INSERT INTO "subscription_lines" ("id", "organization_id", "subscription_id", "workspace_id", "plan_id", "monthly_unit_price_minor",
                                   "minimum_seats", "ledger_opened_on", "closed_on", "closed_reason", "updated_at")
SELECT gen_random_uuid(), s."organization_id", s."id", s."workspace_id", s."plan_id", COALESCE(s."monthly_unit_price_minor", 0),
       s."vendor_minimum_seats",
       CASE WHEN s."status" = 'ACTIVE' AND COALESCE(x."closed_on", 'infinity'::date) >= c."today"
            THEN GREATEST(c."today", s."start_date") END,
       x."closed_on", x."closed_reason", now()
  FROM "subscriptions" s
  JOIN "plans" p ON p."id" = s."plan_id"
 CROSS JOIN (SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS "today") c
  LEFT JOIN "subscriptions" n ON n."renewed_from_id" = s."id"
 CROSS JOIN LATERAL (
        SELECT CASE WHEN n."id" IS NOT NULL THEN COALESCE(n."start_date" - 1, s."end_date", c."today")
                    WHEN s."status" = 'ACTIVE' AND s."end_date" < c."today" THEN s."end_date" END AS "closed_on",
               CASE WHEN n."id" IS NOT NULL THEN 'RENEWED'
                    WHEN s."status" = 'ACTIVE' AND s."end_date" < c."today" THEN 'ENDED' END AS "closed_reason"
        ) x
 WHERE p."provisioning_type" = 'K2' AND s."kind" = 'TERM';

UPDATE "subscription_lines" l
   SET "renewed_from_line_id" = previous."id"
  FROM "subscriptions" s
  JOIN "subscription_lines" previous ON previous."subscription_id" = s."renewed_from_id"
 WHERE l."subscription_id" = s."id";

INSERT INTO "seat_changes" ("id", "organization_id", "subscription_line_id", "effective_on", "delta", "reason", "source", "basis",
                             "renewal_id", "note", "recorded_by_employee_id")
SELECT gen_random_uuid(), l."organization_id", l."id", l."ledger_opened_on", s."purchased_quantity",
       CASE WHEN s."renewed_from_id" IS NOT NULL AND s."start_date" > (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
            THEN 'RENEWAL' ELSE 'INITIAL' END,
       'ADJUSTMENT', 'NONE',
       (SELECT r."id" FROM "subscription_renewals" r WHERE r."next_subscription_id" = s."id"),
       'Mở sổ khi chuyển đổi', NULL
  FROM "subscription_lines" l
  JOIN "subscriptions" s ON s."id" = l."subscription_id"
 WHERE l."ledger_opened_on" IS NOT NULL AND s."purchased_quantity" > 0;

-- 6. The rules in the database.

-- A line sits in the workspace of its period, and its plan is a plan of seats of the vendor of that workspace (C2).
CREATE FUNCTION "subscription_lines_guard"() RETURNS trigger AS $$
DECLARE
    period_workspace UUID;
    period_organization UUID;
    plan_type "ProvisioningType";
    plan_vendor UUID;
    workspace_vendor UUID;
BEGIN
    SELECT s."workspace_id", s."organization_id" INTO period_workspace, period_organization
      FROM "subscriptions" s WHERE s."id" = NEW."subscription_id";
    IF period_workspace IS DISTINCT FROM NEW."workspace_id" OR period_organization <> NEW."organization_id" THEN
        RAISE EXCEPTION 'A line sits in the workspace of its period'
            USING ERRCODE = '23514', CONSTRAINT = 'subscription_lines_workspace_matches_period';
    END IF;
    SELECT p."provisioning_type", a."vendor_id" INTO plan_type, plan_vendor
      FROM "plans" p JOIN "applications" a ON a."id" = p."application_id" WHERE p."id" = NEW."plan_id";
    IF plan_type IS DISTINCT FROM 'K2' THEN
        RAISE EXCEPTION 'The plan of a line is a plan of seats (K2)'
            USING ERRCODE = '23514', CONSTRAINT = 'subscription_lines_plan_is_k2';
    END IF;
    SELECT w."vendor_id" INTO workspace_vendor FROM "workspaces" w WHERE w."id" = NEW."workspace_id";
    IF plan_vendor IS DISTINCT FROM workspace_vendor THEN
        RAISE EXCEPTION 'The plan of a line is of the vendor of its workspace'
            USING ERRCODE = '23514', CONSTRAINT = 'subscription_lines_plan_vendor';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "subscription_lines_guard" BEFORE INSERT OR UPDATE OF "workspace_id", "plan_id", "subscription_id", "organization_id" ON "subscription_lines"
    FOR EACH ROW EXECUTE FUNCTION "subscription_lines_guard"();

-- A period that moves to another workspace takes its lines along (the guard above then judges the plan of each).
CREATE FUNCTION "subscriptions_lines_follow_workspace"() RETURNS trigger AS $$
BEGIN
    UPDATE "subscription_lines" SET "workspace_id" = NEW."workspace_id", "updated_at" = now() WHERE "subscription_id" = NEW."id";
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "subscriptions_lines_follow_workspace" AFTER UPDATE OF "workspace_id" ON "subscriptions"
    FOR EACH ROW WHEN (OLD."workspace_id" IS DISTINCT FROM NEW."workspace_id" AND NEW."workspace_id" IS NOT NULL)
    EXECUTE FUNCTION "subscriptions_lines_follow_workspace"();

-- A purchase of seats says what it said, always.
CREATE FUNCTION "seat_purchases_immutable"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'a purchase of seats is never changed or deleted'
        USING ERRCODE = 'restrict_violation', CONSTRAINT = 'seat_purchases_immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "seat_purchases_immutable" BEFORE UPDATE OR DELETE ON "seat_purchases"
    FOR EACH ROW EXECUTE FUNCTION "seat_purchases_immutable"();

-- The ledger is added to and never changed, not even by the owner of the table.
CREATE FUNCTION "seat_changes_append_only"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'the ledger of seats is only added to'
        USING ERRCODE = 'restrict_violation', CONSTRAINT = 'seat_changes_append_only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "seat_changes_append_only" BEFORE UPDATE OR DELETE ON "seat_changes"
    FOR EACH ROW EXECUTE FUNCTION "seat_changes_append_only"();

-- What a row of the ledger may say of its line, judged with the line locked (so that closing it and writing to it never pass each other).
CREATE FUNCTION "seat_changes_check_row"() RETURNS trigger AS $$
DECLARE
    line RECORD;
    purchase RECORD;
    refunded RECORD;
BEGIN
    SELECT l."organization_id", l."ledger_opened_on", l."closed_on" INTO line
      FROM "subscription_lines" l WHERE l."id" = NEW."subscription_line_id" FOR UPDATE;
    IF NOT FOUND OR line."organization_id" <> NEW."organization_id" THEN
        RAISE EXCEPTION 'The line of a ledger row is a line of its organization'
            USING ERRCODE = '23503', CONSTRAINT = 'seat_changes_subscription_line_id_fkey';
    END IF;
    IF line."ledger_opened_on" IS NULL THEN
        RAISE EXCEPTION 'A line with no ledger is not written to'
            USING ERRCODE = '23514', CONSTRAINT = 'seat_changes_line_has_ledger';
    END IF;
    IF NEW."effective_on" < line."ledger_opened_on" OR (line."closed_on" IS NOT NULL AND NEW."effective_on" > line."closed_on") THEN
        RAISE EXCEPTION 'A ledger row takes effect while its line serves'
            USING ERRCODE = '23514', CONSTRAINT = 'seat_changes_effective_on_in_service';
    END IF;
    IF NEW."seat_purchase_id" IS NOT NULL THEN
        SELECT sp."subscription_line_id", sp."kind" INTO purchase FROM "seat_purchases" sp WHERE sp."id" = NEW."seat_purchase_id";
        IF NOT FOUND OR purchase."subscription_line_id" <> NEW."subscription_line_id" THEN
            RAISE EXCEPTION 'The purchase of a ledger row is a purchase of its line'
                USING ERRCODE = '23514', CONSTRAINT = 'seat_changes_purchase_of_line';
        END IF;
        IF (NEW."source" = 'GRANT' AND purchase."kind" <> 'TOP_UP') OR (NEW."source" = 'VENDOR_RECORD' AND purchase."kind" <> 'TIER_STEP') THEN
            RAISE EXCEPTION 'The kind of the purchase fits the door of the ledger row'
                USING ERRCODE = '23514', CONSTRAINT = 'seat_changes_purchase_kind';
        END IF;
    END IF;
    IF NEW."refunded_seat_change_id" IS NOT NULL THEN
        SELECT c."subscription_line_id" INTO refunded FROM "seat_changes" c WHERE c."id" = NEW."refunded_seat_change_id";
        IF NOT FOUND OR refunded."subscription_line_id" <> NEW."subscription_line_id" THEN
            RAISE EXCEPTION 'A refunded row is a row of the same line'
                USING ERRCODE = '23514', CONSTRAINT = 'seat_changes_refund_of_line';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "seat_changes_check_row" BEFORE INSERT ON "seat_changes"
    FOR EACH ROW EXECUTE FUNCTION "seat_changes_check_row"();

-- On every day from the new row on where the seats or the seats taken change, the seats are not negative and not below the seats taken.
-- Read as READ COMMITTED (the line is locked by the row check above, and what waited for the lock is what is read).
CREATE FUNCTION "seat_changes_check_capacity"() RETURNS trigger AS $$
DECLARE
    line RECORD;
    bad_day DATE;
BEGIN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'The seats of a line are counted under READ COMMITTED only'
            USING ERRCODE = '55000', CONSTRAINT = 'seat_changes_capacity_isolation';
    END IF;
    SELECT l."id", l."subscription_id", l."plan_id", l."closed_on" INTO line FROM "subscription_lines" l WHERE l."id" = NEW."subscription_line_id";

    SELECT d."day" INTO bad_day
      FROM (
            SELECT NEW."effective_on" AS "day"
            UNION
            SELECT c."effective_on" FROM "seat_changes" c
             WHERE c."subscription_line_id" = line."id" AND c."effective_on" > NEW."effective_on"
               AND (line."closed_on" IS NULL OR c."effective_on" <= line."closed_on")
            UNION
            SELECT a."valid_from" FROM "license_assignments" a
             WHERE a."subscription_id" = line."subscription_id" AND a."plan_id" = line."plan_id"
               AND a."valid_from" > NEW."effective_on" AND (line."closed_on" IS NULL OR a."valid_from" <= line."closed_on")
           ) d
     CROSS JOIN LATERAL (
            SELECT COALESCE(sum(c."delta"), 0) AS "seats" FROM "seat_changes" c
             WHERE c."subscription_line_id" = line."id" AND c."effective_on" <= d."day"
           ) s
     CROSS JOIN LATERAL (
            SELECT count(*) AS "taken" FROM "license_assignments" b
             WHERE b."subscription_id" = line."subscription_id" AND b."plan_id" = line."plan_id"
               AND b."valid_from" <= d."day" AND (b."valid_until" IS NULL OR d."day" < b."valid_until")
           ) o
     WHERE s."seats" < 0 OR s."seats" < o."taken"
     ORDER BY d."day"
     LIMIT 1;

    IF bad_day IS NOT NULL THEN
        RAISE EXCEPTION 'The seats of the line fall below the seats taken on %', bad_day
            USING ERRCODE = '23514', CONSTRAINT = 'seat_changes_below_occupancy';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "seat_changes_check_capacity" AFTER INSERT ON "seat_changes"
    FOR EACH ROW EXECUTE FUNCTION "seat_changes_check_capacity"();

-- The targets locked at a renewal: the recorded quantity and the case are set once, from null; the rest never changes.
CREATE FUNCTION "subscription_line_targets_guard"() RETURNS trigger AS $$
BEGIN
    IF (NEW."subscription_line_id", NEW."renewal_on", NEW."seats_needed", NEW."target", NEW."locked_at", NEW."locked_by")
       IS DISTINCT FROM
       (OLD."subscription_line_id", OLD."renewal_on", OLD."seats_needed", OLD."target", OLD."locked_at", OLD."locked_by")
       OR (OLD."recorded_quantity" IS NOT NULL AND NEW."recorded_quantity" IS DISTINCT FROM OLD."recorded_quantity")
       OR (OLD."renewal_id" IS NOT NULL AND NEW."renewal_id" IS DISTINCT FROM OLD."renewal_id") THEN
        RAISE EXCEPTION 'a locked target of a line changes only to record what was decided, once'
            USING ERRCODE = 'restrict_violation', CONSTRAINT = 'subscription_line_targets_guard';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "subscription_line_targets_guard" BEFORE UPDATE ON "subscription_line_targets"
    FOR EACH ROW EXECUTE FUNCTION "subscription_line_targets_guard"();

-- The rule of a subscription of a plan of seats no longer asks an active one to hold its quantity: the ledger of the line holds the seats.
-- The other two rules are those of migration 20261113003500 as they were; the trigger itself stays.
CREATE OR REPLACE FUNCTION "subscriptions_fit_plan"() RETURNS trigger AS $$
DECLARE
    plan_type "ProvisioningType";
    plan_pricing "PricingModel";
    application_kind "ApplicationKind";
BEGIN
    SELECT p."provisioning_type", p."pricing_model", a."kind"
      INTO plan_type, plan_pricing, application_kind
      FROM "plans" p JOIN "applications" a ON a."id" = p."application_id"
     WHERE p."id" = NEW."plan_id";
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    IF plan_type = 'K5' THEN
        RAISE EXCEPTION 'A K5 plan of an internal application has no subscription'
            USING ERRCODE = '23514', CONSTRAINT = 'subscriptions_plan_has_no_subscription';
    END IF;
    IF NEW."kind" = 'PERPETUAL' AND application_kind <> 'LICENSED' AND plan_type <> 'K4' THEN
        RAISE EXCEPTION 'A perpetual purchase belongs to licensed software or to a K4 plan'
            USING ERRCODE = '23514', CONSTRAINT = 'subscriptions_perpetual_needs_licensed';
    END IF;
    IF NEW."status" = 'ACTIVE' AND plan_pricing = 'PER_SEAT' AND plan_type <> 'K2' AND NEW."purchased_quantity" IS NULL THEN
        RAISE EXCEPTION 'An active subscription of a per-seat plan has its quantity'
            USING ERRCODE = '23514', CONSTRAINT = 'subscriptions_per_seat_quantity';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- INV-01: the seats a line serves on a day are its ledger up to that day when the ledger has opened by then, and the quantity of the period
-- before; a period with no line (data older than the ledger) is judged as it was (migration 20261022110000). The row that is locked is the
-- line, as the ledger above locks it, so the two always wait on one another in the same order. READ COMMITTED only, as before.
CREATE OR REPLACE FUNCTION "license_assignment_check_capacity"() RETURNS trigger AS $$
DECLARE
    period_seats INTEGER;
    peak BIGINT;
    line RECORD;
    unknown BOOLEAN;
BEGIN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'The seats of a subscription are counted under READ COMMITTED only'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_capacity_isolation';
    END IF;

    SELECT l."id", l."ledger_opened_on" INTO line
      FROM "subscription_lines" l
     WHERE l."subscription_id" = NEW."subscription_id" AND l."plan_id" = NEW."plan_id"
       FOR UPDATE;

    IF NOT FOUND THEN
        SELECT s."purchased_quantity" INTO period_seats FROM "subscriptions" s WHERE s."id" = NEW."subscription_id" FOR UPDATE;
        IF period_seats IS NULL THEN
            RAISE EXCEPTION 'The number of seats of the subscription is not known'
                USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_seat_capacity';
        END IF;

        SELECT COALESCE(MAX(per_day."occupied"), 0) INTO peak FROM (
            SELECT (
                SELECT count(*) FROM "license_assignments" b
                 WHERE b."subscription_id" = NEW."subscription_id"
                   AND b."valid_from" <= d."day"
                   AND (b."valid_until" IS NULL OR d."day" < b."valid_until")
            ) AS "occupied"
            FROM (
                SELECT NEW."valid_from" AS "day"
                UNION
                SELECT a."valid_from"
                  FROM "license_assignments" a
                 WHERE a."subscription_id" = NEW."subscription_id"
                   AND a."valid_from" > NEW."valid_from"
                   AND (NEW."valid_until" IS NULL OR a."valid_from" < NEW."valid_until")
            ) d
        ) per_day;

        IF peak > period_seats THEN
            RAISE EXCEPTION 'The seats of the subscription are all taken: % assignments for % seats', peak, period_seats
                USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_seat_capacity';
        END IF;
        RETURN NULL;
    END IF;

    SELECT s."purchased_quantity" INTO period_seats FROM "subscriptions" s WHERE s."id" = NEW."subscription_id";

    SELECT COALESCE(MAX(per_day."occupied" - per_day."seats"), 0), COALESCE(bool_or(per_day."seats" IS NULL), false)
      INTO peak, unknown
      FROM (
        SELECT (
                SELECT count(*) FROM "license_assignments" b
                 WHERE b."subscription_id" = NEW."subscription_id" AND b."plan_id" = NEW."plan_id"
                   AND b."valid_from" <= d."day"
                   AND (b."valid_until" IS NULL OR d."day" < b."valid_until")
               ) AS "occupied",
               CASE WHEN line."ledger_opened_on" IS NOT NULL AND line."ledger_opened_on" <= d."day"
                    THEN (SELECT COALESCE(sum(c."delta"), 0) FROM "seat_changes" c
                           WHERE c."subscription_line_id" = line."id" AND c."effective_on" <= d."day")
                    ELSE period_seats END AS "seats"
          FROM (
            SELECT NEW."valid_from" AS "day"
            UNION
            SELECT a."valid_from"
              FROM "license_assignments" a
             WHERE a."subscription_id" = NEW."subscription_id" AND a."plan_id" = NEW."plan_id"
               AND a."valid_from" > NEW."valid_from"
               AND (NEW."valid_until" IS NULL OR a."valid_from" < NEW."valid_until")
            UNION
            SELECT c."effective_on" FROM "seat_changes" c
             WHERE c."subscription_line_id" = line."id" AND c."effective_on" > NEW."valid_from"
               AND (NEW."valid_until" IS NULL OR c."effective_on" < NEW."valid_until")
          ) d
      ) per_day;

    IF unknown THEN
        RAISE EXCEPTION 'The number of seats of the subscription is not known'
            USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_seat_capacity';
    END IF;
    IF peak > 0 THEN
        RAISE EXCEPTION 'The seats of the subscription are all taken: % assignments over the seats', peak
            USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_seat_capacity';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- The invoice of a purchase of seats, and the lines an invoice of a period covers, never change once written (as the other columns).
-- The function is that of migration 20261113004520 with the two columns added to what is compared.
CREATE OR REPLACE FUNCTION purchase_invoices_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'purchase_invoices is never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."state" <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'a signed or returned purchase invoice is never changed' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW."id", NEW."organization_id", NEW."link_kind", NEW."request_id", NEW."provisioning_task_id", NEW."subscription_id", NEW."vendor_id",
      NEW."number", NEW."issued_on", NEW."service_month", NEW."label", NEW."period_index", NEW."period_count", NEW."quantity",
      NEW."unit_price_original_minor", NEW."unit_price_original_currency", NEW."net_minor", NEW."deductible_tax_minor",
      NEW."non_deductible_tax_minor", NEW."match_result", NEW."payment_source", NEW."flags", NEW."charged_cost_center_id",
      NEW."submitted_by_employee_id", NEW."submitted_at", NEW."resubmission_of_id",
      NEW."expected_quantity", NEW."expected_unit_price_original_minor", NEW."expected_unit_price_original_currency",
      NEW."seat_purchase_id", NEW."subscription_line_ids")
     IS DISTINCT FROM
     (OLD."id", OLD."organization_id", OLD."link_kind", OLD."request_id", OLD."provisioning_task_id", OLD."subscription_id", OLD."vendor_id",
      OLD."number", OLD."issued_on", OLD."service_month", OLD."label", OLD."period_index", OLD."period_count", OLD."quantity",
      OLD."unit_price_original_minor", OLD."unit_price_original_currency", OLD."net_minor", OLD."deductible_tax_minor",
      OLD."non_deductible_tax_minor", OLD."match_result", OLD."payment_source", OLD."flags", OLD."charged_cost_center_id",
      OLD."submitted_by_employee_id", OLD."submitted_at", OLD."resubmission_of_id",
      OLD."expected_quantity", OLD."expected_unit_price_original_minor", OLD."expected_unit_price_original_currency",
      OLD."seat_purchase_id", OLD."subscription_line_ids") THEN
    RAISE EXCEPTION 'what a purchase invoice says never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
