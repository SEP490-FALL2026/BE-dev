-- QĐ-110m, R-9, Q2 (X-SA.1b): there is no service account any more. What the earlier releases held as one is written again as the personal seat of an
-- IT Admin flagged "used for a machine account" (`_licensing_machine_account_flag` made the flag and left such a seat out of INV-02; this migration
-- runs after it, and after the value `SYSTEM_SCOPE_REMOVED` and the check that names it). Three parts, each ending with the counts before and after.
-- Forward only: nothing is dropped; a service account row stays as history. The statements are safe to run again (a row converted is ended, a request
-- cancelled is ended, a draft deleted is gone), so an Owner can run the file once more for the rows listed in the notices as kept, when what kept
-- them has passed.
--
-- A seat is never edited into another kind (`license_assignments_immutable` refuses it, and a service account row always has a Cost Center, a personal
-- row never): the service row is ENDED (valid_until = the day of the migration in the calendar of the organization, or the day after when it started on
-- that very day, because the period must be above nothing) and a PERSONAL row is INSERTED from that day, naming it as its predecessor (source
-- `MACHINE_ACCOUNT_CONVERSION`), with the same plan, subscription, owning department and account identifier, no Cost Center, the flag on and the reason
-- of the service account as the note. The day it begins is the day the old one ends, as a change of the responsible person does (the identifier is in use
-- once at a time; no seat is counted twice on a day, INV-01).
--
-- Who takes it: the person who answered for it when that person is an IT Admin who can act (an active, activated account holding IT_ADMIN, an employee
-- who still works and is not time-limited staff, because such a seat needs an expected end date); otherwise the IT Admin in charge of its owning
-- department when that one can act; otherwise the first IT Admin who can act by employee code (the same order the application uses). Q2 (Owner 12/11).
--
-- What is not converted and is listed in a notice instead: a service account with a task of the grant or the revocation still alive, a duty of handover
-- still open, a person who answers for it who has a personnel file (a transfer, a departure) that is not closed, one that has not started, one that ends
-- by itself the day it would be converted, one whose subscription cannot take the new seat (see below), and one for which no IT Admin can act. A duty of handover is open as the application judged it
-- (`OPEN_DUTY`, the unique index of one open duty per seat and `20261113000500_handover_duties_cancel_open`): neither confirmed nor cancelled. The moment
-- `proceeded_unconfirmed_at` only marks an open duty whose revocation went ahead without the confirmation, so it does not close it.
--
-- The new seat does not raise the number of seats a subscription holds on any day (the old one ends the day the new one begins and the new one keeps
-- its end), but the trigger of INV-01 (`license_assignments_capacity_on_insert`) judges the subscription as a whole on every insert: one that already holds
-- more seats than it bought on a day of the new period, or that does not say how many it bought, refuses the insert and would stop this whole file. So the
-- same count is made first (`pg_temp.slm_capacity_refusal`, the query of that trigger on the rows as they are) and such an account is kept, with its reason.

CREATE OR REPLACE FUNCTION pg_temp.slm_usable_it_admin(candidate uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT candidate IS NOT NULL AND EXISTS (
        SELECT 1
          FROM "app_users" u
          JOIN "employees" e ON e."id" = u."employee_id"
         WHERE u."employee_id" = candidate
           AND u."status" = 'ACTIVE' AND u."activation_state" = 'ACTIVATED'
           AND e."status" = 'ACTIVE' AND e."employment_type" NOT IN ('CONTRACTOR', 'FREELANCER', 'INTERN')
           AND EXISTS (
               SELECT 1 FROM "role_grants" g
                WHERE g."app_user_id" = u."id" AND g."role" = 'IT_ADMIN' AND g."revoked_at" IS NULL
           )
    );
$$;

CREATE OR REPLACE FUNCTION pg_temp.slm_capacity_refusal(sub_id uuid, from_day date, until_day date) RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE
    seats integer;
    peak bigint;
BEGIN
    SELECT s."purchased_quantity" INTO seats FROM "subscriptions" s WHERE s."id" = sub_id;
    IF seats IS NULL THEN
        RETURN 'its subscription does not say how many seats were bought';
    END IF;

    -- As `license_assignment_check_capacity`: the seats taken on the day the new period starts and on the start of every other seat inside it.
    SELECT COALESCE(MAX(per_day."occupied"), 0) INTO peak FROM (
        SELECT (
            SELECT count(*) FROM "license_assignments" b
             WHERE b."subscription_id" = sub_id
               AND b."valid_from" <= d."day"
               AND (b."valid_until" IS NULL OR d."day" < b."valid_until")
        ) AS "occupied"
        FROM (
            SELECT from_day AS "day"
            UNION
            SELECT a."valid_from"
              FROM "license_assignments" a
             WHERE a."subscription_id" = sub_id
               AND a."valid_from" > from_day
               AND (until_day IS NULL OR a."valid_from" < until_day)
        ) d
    ) per_day;
    IF peak > seats THEN
        RETURN 'its subscription already holds more seats than were bought';
    END IF;

    RETURN NULL;
END;
$$;

-- 1. The service accounts still in force become seats flagged as a machine account.
DO $$
DECLARE
    rec RECORD;
    target uuid;
    why text;
    capacity_why text;
    end_day date;
    new_id uuid;
    in_force_before integer;
    in_force_after integer;
    converted integer := 0;
    converted_late integer := 0;
    kept integer := 0;
BEGIN
    -- A release that still runs cannot write a seat between the count and the conversion: writers wait, readers do not.
    LOCK TABLE "license_assignments" IN SHARE ROW EXCLUSIVE MODE;

    SELECT count(*) INTO in_force_before
      FROM "license_assignments" a
      JOIN "organizations" o ON o."id" = a."organization_id"
     WHERE a."kind" = 'SERVICE' AND a."failed_at" IS NULL AND a."cancelled_at" IS NULL
       AND (a."valid_until" IS NULL OR a."valid_until" > (now() AT TIME ZONE o."time_zone")::date);

    FOR rec IN
        SELECT a."id", a."organization_id", a."plan_id", a."subscription_id", a."employee_id", a."account_identifier",
               a."normalized_account_identifier", a."reason", a."owning_department_id", a."valid_from", a."valid_until",
               a."expected_end_date", a."created_by_app_user_id", (now() AT TIME ZONE o."time_zone")::date AS day
          FROM "license_assignments" a
          JOIN "organizations" o ON o."id" = a."organization_id"
         WHERE a."kind" = 'SERVICE' AND a."failed_at" IS NULL AND a."cancelled_at" IS NULL
           AND (a."valid_until" IS NULL OR a."valid_until" > (now() AT TIME ZONE o."time_zone")::date)
         ORDER BY a."id"
    LOOP
        end_day := CASE WHEN rec.valid_from >= rec.day THEN rec.valid_from + 1 ELSE rec.day END;
        target := NULL;
        why := NULL;
        capacity_why := CASE WHEN rec.subscription_id IS NOT NULL
                             THEN pg_temp.slm_capacity_refusal(rec.subscription_id, end_day, rec.valid_until) END;

        IF EXISTS (
            SELECT 1 FROM "provisioning_tasks" t
             WHERE t."assignment_id" = rec.id AND t."status" NOT IN ('COMPLETED', 'CLOSED_FAILED', 'CANCELLED')
        ) THEN
            why := 'a task of the grant or of the revocation is still alive';
        ELSIF EXISTS (
            SELECT 1 FROM "handover_duties" d
             WHERE d."assignment_id" = rec.id AND d."confirmed_at" IS NULL AND d."cancelled_at" IS NULL
        ) THEN
            why := 'a duty of handover is still open';
        ELSIF EXISTS (
            SELECT 1 FROM "department_transfers" t
             WHERE t."employee_id" = rec.employee_id AND t."status" IN ('PENDING', 'EFFECTIVE') AND t."closed_at" IS NULL
        ) OR EXISTS (
            SELECT 1 FROM "offboarding_cases" c
             WHERE c."employee_id" = rec.employee_id AND c."state" IN ('HANDING_OVER', 'LEFT') AND c."closed_at" IS NULL
        ) THEN
            why := 'the person who answers for it has a personnel file that is not closed';
        ELSIF rec.valid_from > rec.day THEN
            why := 'it has not started yet';
        ELSIF rec.valid_until IS NOT NULL AND rec.valid_until <= end_day THEN
            why := 'it ends by itself on the day it would be converted';
        ELSIF capacity_why IS NOT NULL THEN
            why := capacity_why;
        ELSE
            IF pg_temp.slm_usable_it_admin(rec.employee_id) THEN
                target := rec.employee_id;
            ELSE
                SELECT d."it_admin_employee_id" INTO target
                  FROM "departments" d
                 WHERE d."id" = rec.owning_department_id AND pg_temp.slm_usable_it_admin(d."it_admin_employee_id");
                IF target IS NULL THEN
                    SELECT u."employee_id" INTO target
                      FROM "app_users" u
                      JOIN "employees" e ON e."id" = u."employee_id"
                     WHERE u."organization_id" = rec.organization_id AND pg_temp.slm_usable_it_admin(u."employee_id")
                     ORDER BY e."employee_code"
                     LIMIT 1;
                END IF;
                IF target IS NULL THEN
                    why := 'no IT Admin can take it';
                END IF;
            END IF;
        END IF;

        IF why IS NOT NULL THEN
            kept := kept + 1;
            RAISE NOTICE 'service account % stays as it is: %', rec.id, why;
            CONTINUE;
        END IF;

        -- The old period ends first, so the identifier is in use once on every day; only when it ends may a seat change (the trigger).
        UPDATE "license_assignments" SET "valid_until" = end_day WHERE "id" = rec.id;
        new_id := gen_random_uuid();
        INSERT INTO "license_assignments" (
            "id", "organization_id", "kind", "source", "plan_id", "subscription_id", "employee_id", "account_identifier",
            "normalized_account_identifier", "reason", "cost_center_id", "owning_department_id", "valid_from", "valid_from_basis",
            "valid_until", "expected_end_date", "predecessor_id", "baseline_import_id", "created_by_app_user_id",
            "is_machine_account", "machine_account_note"
        ) VALUES (
            new_id, rec.organization_id, 'PERSONAL', 'MACHINE_ACCOUNT_CONVERSION', rec.plan_id, rec.subscription_id, target,
            rec.account_identifier, rec.normalized_account_identifier, NULL, NULL, rec.owning_department_id, end_day, 'RECORDED',
            rec.valid_until, CASE WHEN rec.expected_end_date >= end_day THEN rec.expected_end_date END, rec.id, NULL,
            rec.created_by_app_user_id, true, COALESCE(NULLIF(btrim(rec.reason), ''), 'Former service account')
        );
        INSERT INTO "audit_events" (
            "id", "organization_id", "actor_kind", "actor_app_user_id", "actor_roles", "action", "resource_type", "resource_id",
            "before", "after", "correlation_id"
        ) VALUES (
            gen_random_uuid(), rec.organization_id, 'SYSTEM', NULL, '{}', 'LICENSE_ASSIGNMENT.MACHINE_ACCOUNT_CONVERTED',
            'LicenseAssignment', new_id::text,
            jsonb_build_object('assignmentId', rec.id, 'kind', 'SERVICE', 'employeeId', rec.employee_id,
                               'owningDepartmentId', rec.owning_department_id),
            jsonb_build_object('predecessorId', rec.id, 'kind', 'PERSONAL', 'isMachineAccount', true, 'employeeId', target,
                               'validFrom', to_char(end_day, 'YYYY-MM-DD'),
                               'rule', 'service accounts left the scope; the seat is a machine account of an IT Admin (QĐ-110m, R-9)'),
            '20261113000900_licensing_service_accounts_converted'
        );
        converted := converted + 1;
        IF end_day > rec.day THEN
            converted_late := converted_late + 1;
        END IF;
    END LOOP;

    SELECT count(*) INTO in_force_after
      FROM "license_assignments" a
      JOIN "organizations" o ON o."id" = a."organization_id"
     WHERE a."kind" = 'SERVICE' AND a."failed_at" IS NULL AND a."cancelled_at" IS NULL
       AND (a."valid_until" IS NULL OR a."valid_until" > (now() AT TIME ZONE o."time_zone")::date);
    RAISE NOTICE 'service accounts in force before: %, converted: %, kept: %, in force after: %',
        in_force_before, converted, kept, in_force_after;
    -- A row converted ends on the day of the migration, or the day after when it began that day, and that one is still in force today: so what
    -- is in force after is what was kept and what began on the day of the migration, and nothing else.
    IF converted + kept <> in_force_before OR in_force_after <> kept + converted_late THEN
        RAISE EXCEPTION 'Service accounts were lost in the conversion (before %, converted %, kept %, after %)',
            in_force_before, converted, kept, in_force_after;
    END IF;
END $$;

-- 2. A request for a service account still open when the kind left the scope is closed by the system with the cause `SYSTEM_SCOPE_REMOVED`: its
-- steps are closed, it leaves its batch, and what was held for it goes back to the budget (the same writes as `RequestEndService.close`: a release
-- of what is held for each commitment, with the reason REQUEST_CANCELLED). A request whose grant is under way (a task and a seat exist for it), or whose
-- commitment became an expense, is not touched and is listed: its task is the IT Admin's to close.
DO $$
DECLARE
    rec RECORD;
    commitment RECORD;
    why text;
    open_before integer;
    open_after integer;
    cancelled integer := 0;
    kept integer := 0;
    released integer := 0;
BEGIN
    LOCK TABLE "access_requests" IN SHARE ROW EXCLUSIVE MODE;
    LOCK TABLE "budget_commitments" IN SHARE ROW EXCLUSIVE MODE;

    SELECT count(*) INTO open_before FROM "access_requests" r
     WHERE r."type" = 'SERVICE_ACCOUNT'
       AND r."state" NOT IN ('REJECTED', 'IT_REJECTED', 'COMPLETED', 'FAILED', 'WITHDRAWN', 'CANCELLED', 'DRAFT');

    FOR rec IN
        SELECT r."id", r."state"
          FROM "access_requests" r
         WHERE r."type" = 'SERVICE_ACCOUNT'
           AND r."state" NOT IN ('REJECTED', 'IT_REJECTED', 'COMPLETED', 'FAILED', 'WITHDRAWN', 'CANCELLED', 'DRAFT')
         ORDER BY r."id"
           FOR UPDATE
    LOOP
        why := NULL;
        IF rec.state IN ('EXECUTING', 'AWAITING_IT_CLOSE') THEN
            why := 'its grant is under way';
        ELSIF EXISTS (
            SELECT 1 FROM "provisioning_tasks" t
             WHERE t."request_id" = rec.id AND t."status" NOT IN ('COMPLETED', 'CLOSED_FAILED', 'CANCELLED')
        ) THEN
            why := 'a task of its grant is still alive';
        ELSIF EXISTS (
            SELECT 1 FROM "budget_commitments" c WHERE c."request_id" = rec.id AND (c."applied_minor" > 0 OR c."state" = 'EXPENSED')
        ) THEN
            why := 'part of what was held for it became an expense';
        END IF;

        IF why IS NOT NULL THEN
            kept := kept + 1;
            RAISE NOTICE 'request % for a service account stays as it is: %', rec.id, why;
            CONTINUE;
        END IF;

        UPDATE "access_request_steps"
           SET "state" = 'CLOSED', "decided_at" = now(), "waiting_reason" = NULL
         WHERE "request_id" = rec.id AND "state" IN ('PENDING', 'WAITING');
        UPDATE "spend_batch_items"
           SET "left_reason" = 'REQUEST_CANCELLED', "left_at" = now()
         WHERE "request_id" = rec.id AND "left_reason" IS NULL AND "outcome" <> 'STOPPED';

        FOR commitment IN
            SELECT c."id", c."amount_minor", c."released_minor" FROM "budget_commitments" c
             WHERE c."request_id" = rec.id AND c."state" = 'HELD' ORDER BY c."id" FOR UPDATE
        LOOP
            INSERT INTO "budget_commitment_releases" ("id", "commitment_id", "amount_minor", "reason", "released_at")
            VALUES (gen_random_uuid(), commitment.id, commitment.amount_minor - commitment.released_minor, 'REQUEST_CANCELLED', now());
            UPDATE "budget_commitments"
               SET "released_minor" = commitment.amount_minor, "state" = 'RELEASED', "released_at" = now()
             WHERE "id" = commitment.id;
            released := released + 1;
        END LOOP;

        UPDATE "access_requests"
           SET "state" = 'CANCELLED', "cancelled_at" = now(), "cancelled_by_employee_id" = NULL,
               "cancel_cause" = 'SYSTEM_SCOPE_REMOVED', "updated_at" = now()
         WHERE "id" = rec.id;
        cancelled := cancelled + 1;
    END LOOP;

    SELECT count(*) INTO open_after FROM "access_requests" r
     WHERE r."type" = 'SERVICE_ACCOUNT'
       AND r."state" NOT IN ('REJECTED', 'IT_REJECTED', 'COMPLETED', 'FAILED', 'WITHDRAWN', 'CANCELLED', 'DRAFT');
    RAISE NOTICE 'requests for a service account open before: %, cancelled as SYSTEM_SCOPE_REMOVED: %, commitments released: %, kept: %, open after: %',
        open_before, cancelled, released, kept, open_after;
    IF open_after <> kept OR open_before <> cancelled + kept THEN
        RAISE EXCEPTION 'Requests for a service account were lost (before %, cancelled %, kept %, after %)', open_before, cancelled, kept, open_after;
    END IF;
END $$;

-- 3. A draft of a request for a service account can no longer be sent. It is the sender's own unsent copy (a draft has no step, no check, no commitment and
-- no batch item: `access_requests_draft_has_no_work`), so it is removed with the rows that hang from it, as the sender deleting it would.
DO $$
DECLARE
    drafts integer;
    removed integer;
BEGIN
    SELECT count(*) INTO drafts FROM "access_requests" r
     WHERE r."state" = 'DRAFT' AND r."policy" -> 'draft' ->> 'kind' = 'SERVICE_ACCOUNT';

    DELETE FROM "access_request_beneficiaries" b
     USING "access_requests" r
     WHERE b."request_id" = r."id" AND r."state" = 'DRAFT' AND r."policy" -> 'draft' ->> 'kind' = 'SERVICE_ACCOUNT';
    DELETE FROM "access_requests" r
     WHERE r."state" = 'DRAFT' AND r."policy" -> 'draft' ->> 'kind' = 'SERVICE_ACCOUNT';
    GET DIAGNOSTICS removed = ROW_COUNT;

    RAISE NOTICE 'drafts of a request for a service account before: %, removed: %', drafts, removed;
    IF removed <> drafts THEN
        RAISE EXCEPTION 'Drafts of a request for a service account were not all removed (before %, removed %)', drafts, removed;
    END IF;
END $$;
