-- A grant task that is IN_PROGRESS is cancelled for a beneficiary who was transferred as it is for one who left: the IT Admin closes
-- the part of the Request that was not granted after confirming the check with the vendor (g0-g6-final-business-baseline-remediation,
-- F29, spec E; found in the review of the stage as F73). The transition guard allowed `IN_PROGRESS -> CANCELLED` only with the close
-- reason `BENEFICIARY_LEFT`, so the new reason `BENEFICIARY_TRANSFERRED` was refused with `55000` and the whole closing rolled back.
--
-- The function is rewritten from its own current definition and the migration stops unless the one condition it extends is there
-- exactly once. Only a relaxation: the compatibility image never writes the new reason, and every transition it writes is still allowed.
DO $$
DECLARE
    old_definition TEXT;
    anchor CONSTANT TEXT := 'NEW."close_reason" = ''BENEFICIARY_LEFT''';
BEGIN
    old_definition := pg_get_functiondef(to_regproc('provisioning_task_transition_guard'));
    IF old_definition IS NULL
       OR (length(old_definition) - length(replace(old_definition, anchor, ''))) / length(anchor) <> 1 THEN
        RAISE EXCEPTION 'provisioning_task_transition_guard is not in the shape this migration extends';
    END IF;
    EXECUTE replace(old_definition, anchor, 'NEW."close_reason" IN (''BENEFICIARY_LEFT'', ''BENEFICIARY_TRANSFERRED'')');
END
$$;
