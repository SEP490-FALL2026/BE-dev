-- QĐ-110g: no confirmation of a handover is asked of anyone any more, so a duty that still waits for one has nothing left to wait for.
-- Each open duty (not confirmed, not cancelled) is cancelled with the reason RULE_CHANGED; the confirmed ones stay as history, and the
-- cancelled ones as they were. The table, the columns and the enums stay (they are dropped in a later clean-up); no code writes a duty
-- any more. The guard trigger lets a duty that is still open be cancelled, and the cancel_together check asks for the reason with the
-- moment. Forward only: the statement changes no seat, no task and no notice.
DO $$
DECLARE
  open_before integer;
  cancelled integer;
  open_after integer;
BEGIN
  SELECT count(*) INTO open_before FROM "handover_duties" WHERE "confirmed_at" IS NULL AND "cancelled_at" IS NULL;

  UPDATE "handover_duties"
     SET "cancelled_at" = now(), "cancel_reason" = 'RULE_CHANGED'
   WHERE "confirmed_at" IS NULL AND "cancelled_at" IS NULL;
  GET DIAGNOSTICS cancelled = ROW_COUNT;

  SELECT count(*) INTO open_after FROM "handover_duties" WHERE "confirmed_at" IS NULL AND "cancelled_at" IS NULL;
  RAISE NOTICE 'handover duties open before: %, cancelled as RULE_CHANGED: %, open after: %', open_before, cancelled, open_after;
  IF open_after <> 0 OR cancelled <> open_before THEN
    RAISE EXCEPTION 'The open handover duties were not all cancelled (before %, cancelled %, after %)', open_before, cancelled, open_after;
  END IF;
END $$;
